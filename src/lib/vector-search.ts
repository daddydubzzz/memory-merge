import OpenAI from 'openai';
import { z } from 'zod';
import { supabase } from './supabase';
import { 
  searchWithTemporalAwareness, 
  processTemporalQuery
} from './temporal-search';
import type { 
  VectorSearchResult,
  TemporalSearchOptions 
} from './knowledge/types/knowledge';
import type { TemporalInfo } from './temporal-processor';
import type { KnowledgeEntry } from './knowledge/types';

// Create OpenAI client - this should only be used server-side
function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAI({ apiKey });
}

// Schema for embedding response validation
const EmbeddingResponseSchema = z.object({
  data: z.array(z.object({
    embedding: z.array(z.number())
  }))
});

// Synonym mapping for query expansion (same as in embedding.ts and knowledge-search-service.ts)
const SYNONYM_GROUPS = {
  // Anatomical terms (male)
  testicles: [
    'balls', 'nuts', 'testicles', 'testicle', 'sack', 'ballsack', 'nutsack',
    'family jewels', 'nads', 'gonads', 'stones', 'plums', 'rocks', 'eggs',
    'cojones', 'bollocks', 'beans'
  ],

  // Anatomical terms (male)
  penis: [
    'dick', 'cock', 'penis', 'johnson', 'prick', 'dong', 'wang', 'tool',
    'member', 'shaft', 'rod', 'pecker', 'stick', 'phallus', 'meat',
    'package', 'junk', 'manhood'
  ],

  // Anatomical terms (female)
  vagina: [
    'pussy', 'vagina', 'cooch', 'coochie', 'kitty', 'snatch', 'vajayjay',
    'beaver', 'hoo-ha', 'fanny', 'flower', 'lady bits', 'cunt'
  ],

  // Anatomical terms (general)
  breasts: [
    'boobs', 'tits', 'breasts', 'boob', 'titties', 'rack', 'melons',
    'knockers', 'chest', 'girls', 'jugs', 'assets', 'hooters', 'bust',
    'bosom'
  ],

  // Anatomical terms (general)
  buttocks: [
    'ass', 'butt', 'booty', 'buttocks', 'cheeks', 'rear', 'behind',
    'bottom', 'glutes', 'bum', 'rump', 'arse', 'derriere'
  ],

  // Anatomical terms (general)
  anus: [
    'asshole', 'anus', 'butthole', 'arsehole', 'brown eye', 'backdoor',
    'starfish'
  ],

  // Sexual activity
  sex: [
    'sex', 'hook up', 'bang', 'smash', 'get laid', 'bone', 'score',
    'screw', 'do it', 'make love', 'shag', 'get busy', 'fool around',
    'get it on', 'ride'
  ],

  // Money & payments
  money: [
    'money', 'cash', 'bucks', 'dollars', 'bread', 'cheddar', 'dough',
    'moolah', 'loot', 'stacks', 'green', 'paper', 'bands', 'cream',
    'scratch', 'bank', 'dinero'
  ],

  // Vehicles
  car: [
    'car', 'ride', 'wheels', 'vehicle', 'whip', 'auto', 'motor',
    'beater', 'hoopty', 'set of wheels'
  ],

  // Housing
  house: [
    'house', 'home', 'crib', 'pad', 'place', 'spot', 'diggs', 'dwelling',
    'residence'
  ],

  // Alcohol
  alcohol: [
    'booze', 'drinks', 'alcohol', 'liquor', 'beer', 'brew', 'shots',
    'spirits', 'vino', 'wine', 'hooch', 'bevvies'
  ],

  // Intoxication (alcohol)
  drunk: [
    'drunk', 'wasted', 'hammered', 'sloshed', 'plastered', 'smashed',
    'lit', 'buzzed', 'tipsy', 'blitzed', 'tanked'
  ],

  // Cannabis
  marijuana: [
    'weed', 'pot', 'marijuana', 'ganja', 'herb', 'grass', 'bud',
    'mary jane', 'chronic', 'loud', 'reefer', 'dope', 'greenery'
  ],

  // Cocaine
  cocaine: [
    'coke', 'blow', 'cocaine', 'snow', 'powder', 'nose candy', 'white',
    'yayo', 'charlie'
  ],

  // Law enforcement
  police: [
    'cops', 'police', 'cop', 'five-o', 'po-po', 'law', 'heat', 'fuzz',
    'boys in blue', 'pigs'
  ],

  // Friends & acquaintances
  friend: [
    'friend', 'buddy', 'pal', 'homie', 'bro', 'dude', 'mate', 'amigo',
    'compadre', 'ace', 'partner-in-crime'
  ]
};

/**
 * Expand search query with synonyms for better vector similarity
 */
export function expandQueryWithSynonyms(query: string): string {
  let expandedQuery = query;
  const foundSynonyms: string[] = [];
  const contextualTerms: string[] = [];
  const allMatchedGroups: string[][] = [];
  
  const queryLower = query.toLowerCase();
  
  for (const [category, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    for (const synonym of synonyms) {
      // Use word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      if (regex.test(queryLower)) {
        // Add ALL synonyms from this group for maximum semantic coverage
        const allSynonyms = synonyms.filter(s => s !== synonym);
        foundSynonyms.push(...allSynonyms);
        allMatchedGroups.push(synonyms);
        
        // Add semantic category context for AI reasoning
        const categoryName = category.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
        contextualTerms.push(categoryName);
        
        console.log(`🔗 BULLETPROOF QUERY EXPANSION: Found "${synonym}" (${categoryName}), adding ALL terms: [${allSynonyms.join(', ')}]`);
        break; // Only process one match per group
      }
    }
  }
  
  if (foundSynonyms.length > 0) {
    const uniqueSynonyms = [...new Set(foundSynonyms)];
    
    // MAXIMUM STRENGTH query expansion with multiple semantic layers
    expandedQuery += ` [Search context: ${contextualTerms.join(', ')}] `;
    expandedQuery += uniqueSynonyms.join(' ') + ' ';
    expandedQuery += `[Related: ${uniqueSynonyms.slice(0, 8).join(' ')}] `;
    expandedQuery += `[Synonyms: ${uniqueSynonyms.slice(0, 6).join(', ')}]`;
    
    console.log(`🔍 BULLETPROOF EXPANSION: "${query}" → "${expandedQuery.substring(0, 150)}..."`);
    console.log(`🧠 Added ${uniqueSynonyms.length} unique synonyms across ${contextualTerms.length} semantic categories`);
    console.log(`🎯 NUTS→TESTICLE CONNECTION: ${uniqueSynonyms.includes('testicle') ? '✅ ACTIVE' : '❌ NOT FOUND'}`);
  }
  
  return expandedQuery;
}

/**
 * Generate embedding for search query with synonym expansion
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    // Expand query with synonyms before generating embedding
    const expandedQuery = expandQueryWithSynonyms(query);
    
    const openai = createOpenAIClient();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: expandedQuery.replace(/\n/g, ' '), // Clean newlines
      encoding_format: 'float',
      dimensions: 1536,
    });

    // Validate response structure
    const validated = EmbeddingResponseSchema.parse(response);
    
    if (!validated.data[0]?.embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    return validated.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw new Error(`Failed to generate query embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Enhanced search for knowledge entries using temporal-aware vector similarity (optimized)
 */
export async function searchKnowledgeVector(
  accountId: string,
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    useTemporalIntelligence?: boolean;
    temporalOptions?: TemporalSearchOptions;
  } = {}
): Promise<VectorSearchResult[]> {
  try {
    const {
      matchThreshold = 0.4, // LOWERED from 0.65 to catch nuts→testicle connections
      matchCount = 15, // Increased for better coverage
      useTemporalIntelligence = true,
      temporalOptions = {}
    } = options;

    console.log(`🔍 NUTS-HUNTING Vector search (text-embedding-3-large): "${query}" for account: ${accountId}`);
    console.log(`🎯 Using LOWERED threshold (${matchThreshold}) to catch synonym connections`);

    // Generate embedding for the search query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Use temporal-aware search if enabled
    if (useTemporalIntelligence) {
      console.log('🕒 Using temporal-aware search with enhanced reasoning');
      return await searchWithTemporalAwareness(query, accountId, queryEmbedding, {
        temporalRelevanceThreshold: matchThreshold,
        ...temporalOptions
      });
    }

    // Fallback to basic vector search with optimized hydration
    console.log('📊 Using basic vector search with Firebase hydration and enhanced reasoning');
    const { data, error } = await supabase.rpc('match_knowledge_vectors', {
      query_embedding: queryEmbedding,
      account_id: accountId,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error('Supabase RPC error:', error);
      throw new Error(`Vector search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log('📭 No vector results found with current threshold, trying VERY relaxed search...');
      
      // Try with VERY low threshold for synonym connections
      const relaxedThreshold = 0.25; // VERY low to catch any possible connection
      console.log(`🔄 Retrying with VERY relaxed threshold: ${relaxedThreshold}`);
      
      const { data: relaxedData, error: relaxedError } = await supabase.rpc('match_knowledge_vectors', {
        query_embedding: queryEmbedding,
        account_id: accountId,
        match_threshold: relaxedThreshold,
        match_count: matchCount * 3,
      });
      
      if (relaxedError || !relaxedData || relaxedData.length === 0) {
        console.log('📭 No results even with VERY relaxed threshold - synonym system may need debugging');
        return [];
      }
      
      console.log(`🎯 Found ${relaxedData.length} results with VERY relaxed threshold`);
      relaxedData.forEach((result: any, index: number) => {
        console.log(`  ${index + 1}. Similarity: ${result.similarity?.toFixed(3)} - Preview: ${result.enhanced_content?.substring(0, 100)}...`);
      });
      
      const hydratedResults = await hydrateSearchResults(relaxedData);
      console.log(`✅ Successfully hydrated ${hydratedResults.length} relaxed results`);
      return hydratedResults;
    }

    console.log(`🎯 Found ${data.length} vector matches with primary threshold`);
    data.forEach((result: any, index: number) => {
      console.log(`  ${index + 1}. Similarity: ${result.similarity?.toFixed(3)} - Preview: ${result.enhanced_content?.substring(0, 100)}...`);
    });

    // Hydrate results by combining vector data (Supabase) + core data (Firebase)
    const hydratedResults = await hydrateSearchResults(data);
    
    console.log(`✅ Successfully hydrated ${hydratedResults.length} high-quality results`);
    return hydratedResults;

  } catch (error) {
    console.error('Error in searchKnowledgeVector:', error);
    return [];
  }
}

/**
 * Enhanced hybrid search with temporal intelligence and tag-based filtering
 */
export async function hybridSearch(
  accountId: string,
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    minResults?: number;
    tags?: string[];
    useTemporalIntelligence?: boolean;
    temporalOptions?: TemporalSearchOptions;
  } = {}
): Promise<VectorSearchResult[]> {
  try {
    const {
      matchThreshold = 0.5,
      matchCount = 10,
      minResults = 3,
      tags,
      useTemporalIntelligence = true,
      temporalOptions = {}
    } = options;

    // Process query for temporal intelligence if enabled
    let enhancedTemporalOptions = temporalOptions;
    if (useTemporalIntelligence) {
      const temporalQuery = await processTemporalQuery(query);
      enhancedTemporalOptions = {
        ...temporalOptions,
        ...temporalQuery.searchOptions
      };
      
      console.log(`🕒 Temporal query processing: intent=${temporalQuery.temporalIntent}, expressions=[${temporalQuery.temporalExpressions.join(', ')}]`);
    }

    // First try temporal-aware vector search
    const vectorResults = await searchKnowledgeVector(accountId, query, {
      matchThreshold,
      matchCount,
      useTemporalIntelligence,
      temporalOptions: enhancedTemporalOptions
    });

    // Apply tag-based filtering if specified
    let filteredResults = vectorResults;
    if (tags && tags.length > 0) {
      filteredResults = vectorResults.filter(result => 
        tags.some(tag => result.tags.includes(tag))
      );
    }

    // If we have enough results, return them
    if (filteredResults.length >= minResults) {
      return filteredResults;
    }

    // Otherwise, try with a lower threshold for more results
    const relaxedResults = await searchKnowledgeVector(accountId, query, {
      matchThreshold: Math.max(0.3, matchThreshold - 0.2),
      matchCount: matchCount * 2,
      useTemporalIntelligence,
      temporalOptions: {
        ...enhancedTemporalOptions,
        includeExpiredEvents: true // Include more results when relaxing
      }
    });

    // Apply tag filtering to relaxed results too
    if (tags && tags.length > 0) {
      return relaxedResults.filter(result => 
        tags.some(tag => result.tags.includes(tag))
      );
    }

    return relaxedResults;

  } catch (error) {
    console.error('Error in hybridSearch:', error);
    return [];
  }
}

/**
 * Get recent knowledge entries for browsing (optimized with hydration)
 */
export async function getRecentKnowledgeVectors(
  accountId: string,
  limit: number = 20
): Promise<VectorSearchResult[]> {
  try {
    console.log(`📚 Getting recent entries (optimized) for account: ${accountId}, limit: ${limit}`);
    
    const { data, error } = await supabase
      .from('knowledge_vectors')
      .select('id, firebase_doc_id, account_id, enhanced_content, temporal_info, resolved_dates, temporal_relevance_score, contains_temporal_refs, created_at, updated_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Supabase query error:', error);
      throw new Error(`Failed to get recent entries: ${error.message}`);
    }

    console.log(`🔍 Supabase query returned:`, data);
    console.log(`📊 Number of results from Supabase: ${data?.length || 0}`);

    if (!data || data.length === 0) {
      console.log('📭 No recent entries found in Supabase');
      
      // Let's also check if there are ANY entries for this account
      const { data: allData, error: countError } = await supabase
        .from('knowledge_vectors')
        .select('account_id')
        .eq('account_id', accountId);
      
      if (countError) {
        console.error('❌ Error checking for any entries:', countError);
      } else {
        console.log(`🔍 Total entries for account ${accountId}: ${allData?.length || 0}`);
      }
      
      // Also check what accounts exist in the system
      const { data: accountData, error: accountError } = await supabase
        .from('knowledge_vectors')
        .select('account_id')
        .limit(10);
        
      if (!accountError && accountData) {
        const uniqueAccounts = [...new Set(accountData.map(item => item.account_id))];
        console.log(`🔍 Existing accounts in system: [${uniqueAccounts.join(', ')}]`);
      }
      
      return [];
    }

    console.log(`🎯 Found ${data.length} recent vector entries, hydrating from Firebase...`);

    // Create vector results format for hydration
    const vectorResults = data.map(item => ({
      id: item.id,
      firebase_doc_id: item.firebase_doc_id,
      account_id: item.account_id,
      enhanced_content: item.enhanced_content,
      temporal_info: item.temporal_info,
      resolved_dates: item.resolved_dates,
      temporal_relevance_score: item.temporal_relevance_score || 0,
      contains_temporal_refs: item.contains_temporal_refs || false,
      created_at: item.created_at,
      updated_at: item.updated_at,
      similarity: 1.0 // Not applicable for recent entries
    }));

    console.log(`🔗 Vector results prepared for hydration:`, vectorResults.map(v => ({
      id: v.id,
      firebase_doc_id: v.firebase_doc_id,
      account_id: v.account_id
    })));

    // Hydrate results by combining vector data (Supabase) + core data (Firebase)
    const hydratedResults = await hydrateSearchResults(vectorResults);
    
    console.log(`✅ Successfully hydrated ${hydratedResults.length} recent entries`);
    console.log(`📋 Final hydrated results:`, hydratedResults.map(r => ({
      id: r.id,
      content: r.content?.substring(0, 50) + '...',
      tags: r.tags,
      addedBy: r.addedBy
    })));
    
    return hydratedResults;

  } catch (error) {
    console.error('💥 Error in getRecentKnowledgeVectors:', error);
    return [];
  }
}

/**
 * Get knowledge entries by tags (optimized with hydration)
 */
export async function getKnowledgeVectorsByTags(
  accountId: string,
  tags: string[]
): Promise<VectorSearchResult[]> {
  try {
    console.log(`🏷️ Getting entries by tags (optimized) for account: ${accountId}, tags: [${tags.join(', ')}]`);
    
    // Note: We can't filter by tags in Supabase anymore since tags are in Firebase
    // Instead, we'll get all entries and filter after hydration
    // For now, let's use vector search with an empty query and tag filtering
    
    console.log('🔍 Using hybrid search for tag filtering with Firebase hydration');
    return await hybridSearch(accountId, '', {
      matchThreshold: 0, // Very low threshold to get all entries
      matchCount: 100,
      tags
    });

  } catch (error) {
    console.error('Error in getKnowledgeVectorsByTags:', error);
    return [];
  }
}

/**
 * Hydrate vector search results by fetching core data from Firebase using Admin SDK
 */
async function hydrateSearchResults(vectorResults: {
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
    console.log('🔍 No vector results to hydrate');
    return [];
  }

  try {
    // Get unique Firebase document IDs
    const firebaseDocIds = [...new Set(vectorResults.map(r => r.firebase_doc_id))];
    console.log(`🔗 Hydrating ${vectorResults.length} vector results from ${firebaseDocIds.length} Firebase documents`);
    console.log(`📋 Firebase document IDs to fetch: [${firebaseDocIds.join(', ')}]`);

    // Fetch Firebase documents in batch using Admin SDK
    const firebaseDocuments: Record<string, KnowledgeEntry> = {};
    
    // Import Admin SDK for server-side operations (bypasses security rules)
    const { adminDb } = await import('./firebase-admin');
    const db = adminDb();
    
    if (firebaseDocIds.length === 1) {
      // Single document fetch
      console.log(`📄 Fetching single Firebase document: ${firebaseDocIds[0]} (Admin SDK)`);
      const docRef = db.collection('knowledge').doc(firebaseDocIds[0]);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        console.log(`✅ Firebase document found: ${firebaseDocIds[0]}`);
        const data = docSnap.data();
        firebaseDocuments[firebaseDocIds[0]] = {
          id: docSnap.id,
          ...data,
          createdAt: data?.createdAt?.toDate() || new Date(),
          updatedAt: data?.updatedAt?.toDate() || new Date(),
        } as KnowledgeEntry;
      } else {
        console.error(`❌ Firebase document NOT found: ${firebaseDocIds[0]}`);
      }
    } else {
      // Batch document fetch using Admin SDK
      console.log(`📄 Fetching ${firebaseDocIds.length} Firebase documents in batch (Admin SDK)`);
      
      // Admin SDK uses different batch API
      const docs = await Promise.all(
        firebaseDocIds.map(id => db.collection('knowledge').doc(id).get())
      );
      
      console.log(`📊 Firebase batch query returned ${docs.filter(doc => doc.exists).length} documents`);
      
      docs.forEach((doc) => {
        if (doc.exists) {
          console.log(`✅ Firebase document found: ${doc.id}`);
          const data = doc.data();
          firebaseDocuments[doc.id] = {
            id: doc.id,
            ...data,
            createdAt: data?.createdAt?.toDate() || new Date(),
            updatedAt: data?.updatedAt?.toDate() || new Date(),
          } as KnowledgeEntry;
        }
      });
      
      // Log missing documents
      const foundIds = Object.keys(firebaseDocuments);
      const missingIds = firebaseDocIds.filter(id => !foundIds.includes(id));
      if (missingIds.length > 0) {
        console.error(`❌ Firebase documents NOT found: [${missingIds.join(', ')}]`);
      }
    }

    console.log(`✅ Hydrated ${Object.keys(firebaseDocuments).length}/${firebaseDocIds.length} Firebase documents (Admin SDK)`);

    // Combine vector and Firebase data
    const hydratedResults: VectorSearchResult[] = vectorResults
      .map(vectorResult => {
        const firebaseDoc = firebaseDocuments[vectorResult.firebase_doc_id];
        if (!firebaseDoc) {
          console.warn(`⚠️ Firebase document not found for vector: ${vectorResult.id} (firebase_doc_id: ${vectorResult.firebase_doc_id})`);
          return null;
        }

        console.log(`🔗 Successfully combining vector ${vectorResult.id} with Firebase doc ${firebaseDoc.id}`);

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
          temporalInfo: vectorResult.temporal_info || [],
          resolvedDates: vectorResult.resolved_dates?.map((d: string) => new Date(d)) || [],
          temporalRelevanceScore: vectorResult.temporal_relevance_score || 0,
          containsTemporalRefs: vectorResult.contains_temporal_refs || false,
          similarity: vectorResult.similarity,
          temporalContext: '',
          isTemporallyRelevant: true,
          
          // Additional Firebase fields if they exist
          timestamp: firebaseDoc.timestamp,
          replaces: firebaseDoc.replaces,
          replaced_by: firebaseDoc.replaced_by,
          intent: firebaseDoc.intent
        } as VectorSearchResult;
      })
      .filter(result => result !== null);

    console.log(`💾 Optimization: Combined ${hydratedResults.length} results from Firebase (Admin SDK) + Supabase (no duplication)`);
    
    if (hydratedResults.length === 0) {
      console.warn('⚠️ No results after hydration - all Firebase documents were missing');
    }
    
    return hydratedResults;

  } catch (error) {
    console.error('💥 Error hydrating search results:', error);
    // Return empty results on hydration failure
    return [];
  }
} 