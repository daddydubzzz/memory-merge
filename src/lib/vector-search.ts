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
function expandQueryWithSynonyms(query: string): string {
  let expandedQuery = query;
  const foundSynonyms: string[] = [];
  
  const queryLower = query.toLowerCase();
  
  for (const synonyms of Object.values(SYNONYM_GROUPS)) {
    for (const synonym of synonyms) {
      // Use word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      if (regex.test(queryLower)) {
        // Add some related synonyms to the query (not all to avoid overwhelming the embedding)
        const relatedSynonyms = synonyms.filter(s => s !== synonym).slice(0, 4);
        foundSynonyms.push(...relatedSynonyms);
        console.log(`🔗 Found "${synonym}" in query, adding related terms: [${relatedSynonyms.join(', ')}]`);
        break; // Only process one match per group
      }
    }
  }
  
  if (foundSynonyms.length > 0) {
    expandedQuery += ` ${foundSynonyms.join(' ')}`;
    console.log(`🔍 Expanded query: "${query}" → "${expandedQuery}"`);
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
      model: 'text-embedding-3-small',
      input: expandedQuery.replace(/\n/g, ' '), // Clean newlines
      encoding_format: 'float',
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
 * Enhanced search for knowledge entries using temporal-aware vector similarity
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
      matchThreshold = 0.5,
      matchCount = 10,
      useTemporalIntelligence = true,
      temporalOptions = {}
    } = options;

    // Generate embedding for the search query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Use temporal-aware search if enabled
    if (useTemporalIntelligence) {
      console.log('🕒 Using temporal-aware search');
      return await searchWithTemporalAwareness(query, accountId, queryEmbedding, {
        temporalRelevanceThreshold: matchThreshold,
        ...temporalOptions
      });
    }

    // Fallback to basic vector search
    console.log('📊 Using basic vector search');
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

    if (!data) {
      return [];
    }

    // Transform results to match our interface
    return data.map((item: {
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
    }) => ({
      id: item.id,
      content: item.content,
      enhanced_content: item.enhanced_content,
      processed_content: item.processed_content,
      tags: item.tags || [],
      addedBy: item.added_by,
      addedByName: item.added_by_name,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      accountId: item.account_id,
      temporalInfo: item.temporal_info || [],
      resolvedDates: item.resolved_dates?.map((d: string) => new Date(d)) || [],
      temporalRelevanceScore: item.temporal_relevance_score || 0,
      containsTemporalRefs: item.contains_temporal_refs || false,
      similarity: item.similarity,
      temporalContext: '',
      isTemporallyRelevant: true
    }));

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
 * Get recent knowledge entries for browsing
 */
export async function getRecentKnowledgeVectors(
  accountId: string,
  limit: number = 20
): Promise<VectorSearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('knowledge_vectors')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase query error:', error);
      throw new Error(`Failed to get recent entries: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return data.map((item: {
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
    }) => ({
      id: item.id,
      content: item.content,
      enhanced_content: item.enhanced_content,
      processed_content: item.processed_content,
      tags: item.tags || [],
      addedBy: item.added_by,
      addedByName: item.added_by_name,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      accountId: item.account_id,
      temporalInfo: item.temporal_info || [],
      resolvedDates: item.resolved_dates?.map((d: string) => new Date(d)) || [],
      temporalRelevanceScore: item.temporal_relevance_score || 0,
      containsTemporalRefs: item.contains_temporal_refs || false,
      similarity: 1.0, // Not applicable for recent entries
      temporalContext: '',
      isTemporallyRelevant: true
    }));

  } catch (error) {
    console.error('Error in getRecentKnowledgeVectors:', error);
    return [];
  }
}

/**
 * Get knowledge entries by tags
 */
export async function getKnowledgeVectorsByTags(
  accountId: string,
  tags: string[]
): Promise<VectorSearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('knowledge_vectors')
      .select('*')
      .eq('account_id', accountId)
      .overlaps('tags', tags)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error:', error);
      throw new Error(`Failed to fetch entries by tags: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return data.map((item: {
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
    }) => ({
      id: item.id,
      content: item.content,
      enhanced_content: item.enhanced_content,
      processed_content: item.processed_content,
      tags: item.tags || [],
      addedBy: item.added_by,
      addedByName: item.added_by_name,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      accountId: item.account_id,
      temporalInfo: item.temporal_info || [],
      resolvedDates: item.resolved_dates?.map((d: string) => new Date(d)) || [],
      temporalRelevanceScore: item.temporal_relevance_score || 0,
      containsTemporalRefs: item.contains_temporal_refs || false,
      similarity: 1.0, // Not applicable for tag browsing
      temporalContext: '',
      isTemporallyRelevant: true
    }));

  } catch (error) {
    console.error('Error in getKnowledgeVectorsByTags:', error);
    return [];
  }
} 