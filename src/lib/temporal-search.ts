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

/**
 * Enhanced vector search with temporal intelligence
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
    console.log(`🔍 Performing temporal-aware search for: "${query}"`);
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
      console.log('📭 No results found');
      return [];
    }

    // Process and enhance results with temporal intelligence
    const enhancedResults: VectorSearchResult[] = results.map((result: { 
      id: string; 
      content: string; 
      enhanced_content?: string; 
      processed_content?: string; 
      tags: string[]; 
      added_by: string; 
      added_by_name?: string; 
      created_at: string; 
      updated_at: string; 
      account_id: string; 
      temporal_info?: TemporalInfo[]; 
      resolved_dates?: string[]; 
      temporal_relevance_score?: number; 
      contains_temporal_refs?: boolean; 
      similarity: number; 
    }) => {
      const temporalInfo: TemporalInfo[] = result.temporal_info || [];
      const createdAt = new Date(result.created_at);
      
      // Calculate temporal relevance for this specific query
      const isRelevant = isTemporallyRelevant(temporalInfo, { 
        includeExpiredEvents, 
        timeFrame 
      });
      
      // Generate temporal context for AI responses
      const temporalContext = temporalInfo.length > 0 
        ? createTemporalContext(temporalInfo, createdAt)
        : '';
      
      // Calculate next occurrence for recurring events
      const recurringTemporal = temporalInfo.find(t => t.recurringPattern);
      const nextOccurrence = recurringTemporal
        ? getNextOccurrence(recurringTemporal)
        : undefined;

      // Calculate combined score (semantic similarity + temporal relevance)
      const semanticScore = result.similarity;
      const temporalScore = result.temporal_relevance_score || 0;
      const combinedScore = (semanticScore * (1 - temporalRelevanceWeight)) + 
                           (temporalScore * temporalRelevanceWeight);

      return {
        ...result,
        id: result.id,
        content: result.content,
        enhanced_content: result.enhanced_content,
        processed_content: result.processed_content,
        tags: result.tags,
        addedBy: result.added_by,
        addedByName: result.added_by_name,
        createdAt: createdAt,
        updatedAt: new Date(result.updated_at),
        accountId: result.account_id,
        temporalInfo: temporalInfo,
        resolvedDates: result.resolved_dates?.map((d: string) => new Date(d)) || [],
        temporalRelevanceScore: temporalScore,
        containsTemporalRefs: result.contains_temporal_refs,
        similarity: combinedScore, // Use combined score for sorting
        temporalContext,
        isTemporallyRelevant: isRelevant,
        nextOccurrence
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

    console.log(`✅ Found ${filteredResults.length} temporally-relevant results`);
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