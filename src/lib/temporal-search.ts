import { supabase } from './supabase';
import type { 
  VectorSearchResult, 
  TemporalSearchOptions, 
  TemporalQuery 
} from './knowledge/types/knowledge';
import { 
  processTemporalContent, 
  createTemporalContext, 
  isTemporallyRelevant, 
  getNextOccurrence,
  type TemporalInfo 
} from './temporal-processor';

// Import Firebase for hydrating results
import { doc, getDoc, getDocs, collection, query, where, documentId } from 'firebase/firestore';
import { db } from './firebase';
import type { KnowledgeEntry } from './knowledge/types';

/**
 * Enhanced vector search with temporal intelligence (optimized)
 */
export async function searchWithTemporalAwareness(
  query: string,
  accountId: string,
  embedding: number[],
  options: TemporalSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const {
    timeFrame = 'all',
    temporalRelevanceWeight = 0.3,
    includeExpiredEvents = false,
    temporalRelevanceThreshold = 0.2
  } = options;

  try {
    console.log(`🔍 Performing temporal-aware search (optimized) for: "${query}"`);
    console.log(`🕒 Time frame: ${timeFrame}, temporal weight: ${temporalRelevanceWeight}`);

    // Process the query for temporal expressions
    const queryTemporalInfo = await processTemporalContent(query);
    const temporalIntent = determineTemporalIntent(query, queryTemporalInfo);

    // Perform vector search with temporal filtering
    const { data: results, error } = await supabase.rpc('match_knowledge_vectors', {
      query_embedding: embedding,
      account_id: accountId,
      match_threshold: 0.3,
      match_count: 50, // Get more results to filter temporally
      include_temporal_filter: true,
      temporal_relevance_threshold: temporalRelevanceThreshold
    });

    if (error) {
      console.error('Vector search error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }

    if (!results || results.length === 0) {
      console.log('📭 No temporal results found');
      return [];
    }

    console.log(`🕒 Found ${results.length} temporal vector matches, hydrating from Firebase...`);

    // Hydrate results by combining vector data (Supabase) + core data (Firebase)
    const hydratedResults = await hydrateTemporalResults(results);
    
    if (hydratedResults.length === 0) {
      console.log('⚠️ No results after hydration');
      return [];
    }

    // Apply temporal processing to hydrated results
    const enhancedResults: VectorSearchResult[] = hydratedResults.map(result => {
      const temporalInfo: TemporalInfo[] = result.temporalInfo || [];
      
      // Calculate temporal relevance for this specific query
      const isRelevant = isTemporallyRelevant(temporalInfo, { 
        includeExpiredEvents, 
        timeFrame 
      });

      // Calculate combined score (semantic similarity + temporal relevance)
      const semanticScore = result.similarity;
      const temporalScore = result.temporalRelevanceScore || 0;
      const combinedScore = (semanticScore * (1 - temporalRelevanceWeight)) + 
                           (temporalScore * temporalRelevanceWeight);

      return {
        ...result,
        similarity: combinedScore, // Use combined score for sorting
        isTemporallyRelevant: isRelevant // Ensure this is always a boolean
      };
    });

    // Filter out temporally irrelevant results if specified
    let filteredResults = enhancedResults;
    
    if (timeFrame !== 'all') {
      filteredResults = enhancedResults.filter(result => result.isTemporallyRelevant);
    }

    // Apply temporal intent filtering
    if (temporalIntent !== 'general') {
      filteredResults = applyTemporalIntentFilter(filteredResults, temporalIntent);
    }

    // Sort by combined score (already calculated above)
    filteredResults.sort((a, b) => b.similarity - a.similarity);

    console.log(`✅ Found ${filteredResults.length} temporally-relevant results (optimized)`);
    console.log(`🕒 Temporal intent: ${temporalIntent}`);
    
    // Log temporal context for debugging
    filteredResults.slice(0, 3).forEach((result, i) => {
      if (result.temporalContext) {
        console.log(`🕒 Result ${i + 1} temporal context: ${result.temporalContext}`);
      }
    });

    return filteredResults.slice(0, 20); // Return top 20 results
    
  } catch (error) {
    console.error('Error in temporal search:', error);
    throw error;
  }
}

/**
 * Determine the temporal intent of a query
 */
function determineTemporalIntent(query: string, temporalInfo: { containsTemporalRefs: boolean }): 'future' | 'past' | 'current' | 'general' {
  const lowerQuery = query.toLowerCase();
  
  // Future intent indicators
  if (lowerQuery.includes('will') || lowerQuery.includes('upcoming') || 
      lowerQuery.includes('next') || lowerQuery.includes('future') ||
      lowerQuery.includes('planning') || lowerQuery.includes('scheduled') ||
      lowerQuery.includes('tomorrow') || lowerQuery.includes('later')) {
    return 'future';
  }
  
  // Past intent indicators
  if (lowerQuery.includes('was') || lowerQuery.includes('did') || 
      lowerQuery.includes('happened') || lowerQuery.includes('last') ||
      lowerQuery.includes('ago') || lowerQuery.includes('before') ||
      lowerQuery.includes('yesterday') || lowerQuery.includes('previous')) {
    return 'past';
  }
  
  // Current intent indicators
  if (lowerQuery.includes('today') || lowerQuery.includes('now') || 
      lowerQuery.includes('current') || lowerQuery.includes('this week') ||
      lowerQuery.includes('this month') || lowerQuery.includes('recent')) {
    return 'current';
  }
  
  // Check if query has temporal expressions but no clear intent
  if (temporalInfo.containsTemporalRefs) {
    return 'current'; // Default to current for temporal queries
  }
  
  return 'general';
}

/**
 * Apply temporal intent filtering to results
 */
function applyTemporalIntentFilter(
  results: VectorSearchResult[], 
  intent: 'future' | 'past' | 'current'
): VectorSearchResult[] {
  const currentDate = new Date();
  
  return results.filter(result => {
    if (!result.temporalInfo || result.temporalInfo.length === 0) {
      // Non-temporal content is always included
      return true;
    }
    
    // Check if any temporal info matches the intent
    return result.temporalInfo.some(temporal => {
      if (!temporal.resolvedDate) return false;
      
      const daysDiff = Math.floor(
        (temporal.resolvedDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      switch (intent) {
        case 'future':
          return daysDiff > 0 || temporal.recurringPattern; // Future dates or recurring events
        case 'past':
          return daysDiff < 0; // Past dates
        case 'current':
          return Math.abs(daysDiff) <= 7 || temporal.recurringPattern; // Within a week or recurring
        default:
          return true;
      }
    });
  });
}

/**
 * Get temporally relevant knowledge for a specific time frame
 */
export async function getTemporallyRelevantKnowledge(
  accountId: string,
  timeFrame: 'future' | 'past' | 'current' | 'all' = 'all',
  limit: number = 20
): Promise<VectorSearchResult[]> {
  try {
    console.log(`📅 Getting temporally relevant knowledge for timeframe: ${timeFrame}`);
    
    const { data: results, error } = await supabase.rpc('get_temporally_relevant_knowledge', {
      account_id: accountId,
      time_frame: timeFrame,
      limit_count: limit
    });

    if (error) {
      console.error('Temporal knowledge query error:', error);
      throw new Error(`Failed to get temporal knowledge: ${error.message}`);
    }

    if (!results || results.length === 0) {
      return [];
    }

    // Convert to VectorSearchResult format
    const enhancedResults: VectorSearchResult[] = results.map((result: {
      id: string;
      content: string;
      temporal_info?: TemporalInfo[];
      resolved_dates?: string[];
      temporal_relevance_score: number;
      created_at: string;
    }) => {
      const temporalInfo: TemporalInfo[] = result.temporal_info || [];
      const createdAt = new Date(result.created_at);
      
      // Find recurring temporal for next occurrence calculation
      const recurringTemporal = temporalInfo.find(t => t.recurringPattern);
      
      return {
        id: result.id,
        content: result.content,
        enhanced_content: '', // Not needed for this query
        tags: [], // Not selected in this query
        addedBy: '',
        createdAt: createdAt,
        updatedAt: createdAt,
        accountId: accountId,
        temporalInfo: temporalInfo,
        resolvedDates: result.resolved_dates?.map((d: string) => new Date(d)) || [],
        temporalRelevanceScore: result.temporal_relevance_score,
        containsTemporalRefs: true, // All results from this query have temporal refs
        similarity: result.temporal_relevance_score, // Use temporal score as similarity
        temporalContext: createTemporalContext(temporalInfo, createdAt),
        isTemporallyRelevant: true,
        nextOccurrence: recurringTemporal ? getNextOccurrence(recurringTemporal) : undefined
      };
    });

    console.log(`✅ Found ${enhancedResults.length} temporally relevant entries`);
    return enhancedResults;
    
  } catch (error) {
    console.error('Error getting temporal knowledge:', error);
    throw error;
  }
}

/**
 * Process a query for temporal expressions and create a temporal query object
 */
export async function processTemporalQuery(query: string): Promise<TemporalQuery> {
  const temporalInfo = await processTemporalContent(query);
  const temporalIntent = determineTemporalIntent(query, temporalInfo);
  
  // Create enhanced query with temporal context
  const processedQuery = temporalInfo.containsTemporalRefs 
    ? `${query} (temporal context: ${temporalInfo.processedContent})`
    : query;
  
  // Generate appropriate search options based on query
  const searchOptions: TemporalSearchOptions = {
    timeFrame: temporalIntent === 'general' ? 'all' : temporalIntent,
    temporalRelevanceWeight: temporalInfo.containsTemporalRefs ? 0.4 : 0.2,
    includeExpiredEvents: temporalIntent === 'past',
    includeRecurringEvents: true,
    temporalRelevanceThreshold: 0.2
  };
  
  return {
    originalQuery: query,
    processedQuery,
    temporalIntent,
    temporalExpressions: temporalInfo.temporalInfo.map(t => t.originalText),
    searchOptions
  };
}

/**
 * Update temporal relevance scores for all entries (background task)
 */
export async function updateTemporalRelevanceScores(accountId: string): Promise<void> {
  try {
    console.log(`🔄 Updating temporal relevance scores for account: ${accountId}`);
    
    const { error } = await supabase.rpc('update_temporal_relevance_scores', {
      account_id: accountId
    });

    if (error) {
      console.error('Error updating temporal relevance scores:', error);
      throw new Error(`Failed to update temporal scores: ${error.message}`);
    }

    console.log(`✅ Updated temporal relevance scores for account: ${accountId}`);
  } catch (error) {
    console.error('Error in updateTemporalRelevanceScores:', error);
    throw error;
  }
}

/**
 * Hydrate vector search results by fetching core data from Firebase
 * (Duplicate of function in vector-search.ts to avoid circular imports)
 */
async function hydrateTemporalResults(vectorResults: {
  id: string;
  firebase_doc_id: string;
  account_id: string;
  enhanced_content?: string;
  temporal_info?: TemporalInfo[];
  resolved_dates?: string[];
  temporal_relevance_score?: number;
  contains_temporal_refs?: boolean;
  created_at: string;
  updated_at: string;
  similarity: number;
}[]): Promise<VectorSearchResult[]> {
  if (vectorResults.length === 0) {
    return [];
  }

  try {
    // Get unique Firebase document IDs
    const firebaseDocIds = [...new Set(vectorResults.map(r => r.firebase_doc_id))];
    console.log(`🔗 Temporal search hydrating ${vectorResults.length} vector results from ${firebaseDocIds.length} Firebase documents`);

    // Fetch Firebase documents in batch
    const firebaseDocuments: Record<string, KnowledgeEntry> = {};
    
    if (firebaseDocIds.length === 1) {
      // Single document fetch
      const docRef = doc(db, 'knowledge', firebaseDocIds[0]);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        firebaseDocuments[firebaseDocIds[0]] = {
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: docSnap.data().createdAt?.toDate() || new Date(),
          updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
        } as KnowledgeEntry;
      }
    } else {
      // Batch document fetch
      const q = query(
        collection(db, 'knowledge'),
        where(documentId(), 'in', firebaseDocIds)
      );
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach((doc) => {
        firebaseDocuments[doc.id] = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        } as KnowledgeEntry;
      });
    }

    console.log(`✅ Temporal search hydrated ${Object.keys(firebaseDocuments).length}/${firebaseDocIds.length} Firebase documents`);

    // Combine vector and Firebase data
    const hydratedResults: VectorSearchResult[] = vectorResults
      .map(vectorResult => {
        const firebaseDoc = firebaseDocuments[vectorResult.firebase_doc_id];
        if (!firebaseDoc) {
          console.warn(`⚠️ Firebase document not found: ${vectorResult.firebase_doc_id}`);
          return null;
        }

        // Calculate temporal context
        const temporalInfo: TemporalInfo[] = vectorResult.temporal_info || [];
        const temporalContext = temporalInfo.length > 0 
          ? createTemporalContext(temporalInfo, firebaseDoc.createdAt)
          : '';

        // Calculate next occurrence for recurring events
        const recurringTemporal = temporalInfo.find(t => t.recurringPattern);
        const nextOccurrence = recurringTemporal
          ? getNextOccurrence(recurringTemporal)
          : undefined;

        return {
          // Core data from Firebase (source of truth)
          id: firebaseDoc.id,
          content: firebaseDoc.content,
          tags: firebaseDoc.tags,
          addedBy: firebaseDoc.addedBy,
          addedByName: firebaseDoc.addedByName,
          createdAt: firebaseDoc.createdAt,
          updatedAt: firebaseDoc.updatedAt,
          accountId: firebaseDoc.accountId,
          
          // Vector and AI-specific data from Supabase
          enhanced_content: vectorResult.enhanced_content,
          temporalInfo: temporalInfo,
          resolvedDates: vectorResult.resolved_dates?.map((d: string) => new Date(d)) || [],
          temporalRelevanceScore: vectorResult.temporal_relevance_score || 0,
          containsTemporalRefs: vectorResult.contains_temporal_refs || false,
          similarity: vectorResult.similarity,
          temporalContext,
          isTemporallyRelevant: true,
          nextOccurrence,
          
          // Additional Firebase fields if they exist
          timestamp: firebaseDoc.timestamp,
          replaces: firebaseDoc.replaces,
          replaced_by: firebaseDoc.replaced_by,
          intent: firebaseDoc.intent
        } as VectorSearchResult;
      })
      .filter(result => result !== null);

    return hydratedResults;

  } catch (error) {
    console.error('Error hydrating temporal search results:', error);
    // Return empty results on hydration failure
    return [];
  }
} 