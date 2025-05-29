import OpenAI from 'openai';
import { z } from 'zod';
import { supabase } from './supabase';

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

// Search result with similarity score
export interface VectorSearchResult {
  id: string;
  content: string;
  tags: string[];
  addedBy: string;
  createdAt: Date;
  updatedAt: Date;
  similarity: number;
}

/**
 * Generate embedding for search query
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    const openai = createOpenAIClient();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query.replace(/\n/g, ' '), // Clean newlines
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
 * Search for knowledge entries using vector similarity
 */
export async function searchKnowledgeVector(
  accountId: string,
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<VectorSearchResult[]> {
  try {
    const {
      matchThreshold = 0.5, // Minimum similarity threshold
      matchCount = 10       // Maximum number of results
    } = options;

    // Generate embedding for the search query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Call the Supabase RPC function
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
      tags: string[];
      added_by: string;
      created_at: string;
      updated_at: string;
      similarity: number;
    }) => ({
      id: item.id,
      content: item.content,
      tags: item.tags || [],
      addedBy: item.added_by,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      similarity: item.similarity
    }));

  } catch (error) {
    console.error('Error in searchKnowledgeVector:', error);
    
    // Return empty array on error to prevent crashes
    // In production, you might want to log this to monitoring
    return [];
  }
}

/**
 * Search with tag-based filtering and fallback to keyword search if vector search returns few results
 */
export async function hybridSearch(
  accountId: string,
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    minResults?: number;
    tags?: string[]; // Add tag filtering option
  } = {}
): Promise<VectorSearchResult[]> {
  try {
    const {
      matchThreshold = 0.5,
      matchCount = 10,
      minResults = 3,
      tags
    } = options;

    // First try vector search
    const vectorResults = await searchKnowledgeVector(accountId, query, {
      matchThreshold,
      matchCount
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
      matchCount: matchCount * 2
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
      throw new Error(`Failed to fetch recent entries: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return data.map(item => ({
      id: item.id,
      content: item.content,
      tags: item.tags || [],
      addedBy: item.added_by,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      similarity: 1.0 // Not applicable for recent entries
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

    return data.map(item => ({
      id: item.id,
      content: item.content,
      tags: item.tags || [],
      addedBy: item.added_by,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      similarity: 1.0 // Not applicable for tag browsing
    }));

  } catch (error) {
    console.error('Error in getKnowledgeVectorsByTags:', error);
    return [];
  }
} 