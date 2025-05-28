import OpenAI from 'openai';
import { z } from 'zod';
import { supabase, type KnowledgeVector } from './supabase';
import type { KnowledgeEntry } from './constants';

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

/**
 * Generate embedding for text using OpenAI's text-embedding-3-small model
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = createOpenAIClient();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' '), // Clean newlines
      encoding_format: 'float',
    });

    // Validate response structure
    const validated = EmbeddingResponseSchema.parse(response);
    
    if (!validated.data[0]?.embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    return validated.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Store knowledge entry with its vector embedding in Supabase
 */
export async function storeWithEmbedding(
  accountId: string,
  entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>
): Promise<string> {
  try {
    // Generate embedding for the content
    const embedding = await generateEmbedding(entry.content);

    // Store in Supabase with embedding
    const { data, error } = await supabase
      .from('knowledge_vectors')
      .insert({
        account_id: accountId,
        content: entry.content,
        tags: entry.tags,
        added_by: entry.addedBy,
        embedding: embedding,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      throw new Error(`Failed to store embedding: ${error.message}`);
    }

    if (!data?.id) {
      throw new Error('No ID returned from Supabase insert');
    }

    return data.id;
  } catch (error) {
    console.error('Error in storeWithEmbedding:', error);
    throw error;
  }
}

/**
 * Update existing knowledge vector with new content and embedding
 */
export async function updateWithEmbedding(
  id: string,
  updates: { content?: string; tags?: string[] }
): Promise<void> {
  try {
    let embedding: number[] | undefined;
    
    // Generate new embedding if content changed
    if (updates.content) {
      embedding = await generateEmbedding(updates.content);
    }

    const updateData: any = { ...updates };
    if (embedding) {
      updateData.embedding = embedding;
    }

    const { error } = await supabase
      .from('knowledge_vectors')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Supabase update error:', error);
      throw new Error(`Failed to update embedding: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in updateWithEmbedding:', error);
    throw error;
  }
}

/**
 * Delete knowledge vector by ID
 */
export async function deleteKnowledgeVector(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('knowledge_vectors')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new Error(`Failed to delete knowledge vector: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in deleteKnowledgeVector:', error);
    throw error;
  }
}

/**
 * Batch generate embeddings for multiple texts
 * Useful for initial data migration
 */
export async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const openai = createOpenAIClient();
    
    // OpenAI supports batch embedding requests
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts.map(text => text.replace(/\n/g, ' ')),
      encoding_format: 'float',
    });

    const validated = EmbeddingResponseSchema.parse(response);
    return validated.data.map(item => item.embedding);
  } catch (error) {
    console.error('Error in batch embedding generation:', error);
    throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 