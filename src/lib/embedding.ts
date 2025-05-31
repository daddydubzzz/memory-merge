import OpenAI from 'openai';
import { z } from 'zod';
import { supabase } from './supabase';
import type { KnowledgeEntry } from './knowledge/types';
import { getUserDisplayName } from './knowledge/services/utility-service';
import { processTemporalContent } from './temporal-processor';

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
 * Enhanced with temporal intelligence and user context for superior search relevance
 */
export async function storeWithEmbedding(
  accountId: string,
  entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>
): Promise<string> {
  try {
    // IMPORTANT: Use the actual time when the entry was created
    // This represents when the user actually added the information
    const storageDate = new Date();
    
    // For temporal processing, use the same date to ensure consistency
    // This ensures "tomorrow" gets resolved relative to when the user said it
    const temporalReferenceDate = storageDate;
    
    console.log(`📅 Storage date: ${storageDate.toISOString()}`);
    console.log(`📅 Local storage date: ${storageDate.toLocaleDateString()} ${storageDate.toLocaleTimeString()}`);
    
    // Use provided display name or fall back to user lookup (with improved error handling)
    let userName = entry.addedByName;
    if (!userName) {
      console.log(`⚠️ No addedByName provided, attempting server-side lookup for ${entry.addedBy}`);
      try {
        userName = await getUserDisplayName(entry.addedBy);
        console.log(`👤 Server-side resolved user name for ${entry.addedBy}: "${userName}"`);
      } catch (error) {
        console.warn(`❌ Server-side user lookup failed for ${entry.addedBy}:`, error);
        userName = `User ${entry.addedBy.substring(0, 8)}`;
      }
    } else {
      console.log(`👤 Using provided user name: "${userName}"`);
    }
    
    // Process temporal content to extract and resolve temporal expressions
    console.log(`🕒 Processing temporal content: "${entry.content}"`);
    console.log(`🕒 Using temporal reference date: ${temporalReferenceDate.toISOString()}`);
    const temporalInfo = await processTemporalContent(entry.content, temporalReferenceDate);
    
    // Create multi-layered enhanced content for embedding:
    // 1. User context: "Added by John: ..."
    // 2. Storage context: "Stored on 2024-01-15, refers to 2024-01-16: ..."
    // 3. Original content: "remind my wife there's a birthday party tomorrow"
    // 4. Processed content: "remind my wife there's a birthday party tomorrow (Tuesday, January 16, 2024)"
    
    const userContext = `Added by ${userName}`;
    // Use the actual storage date for context, not the temporal reference date
    const storageContext = `on ${storageDate.toLocaleDateString('en-CA')}`; // YYYY-MM-DD format in local time
    const temporalContext = temporalInfo.containsTemporalRefs 
      ? `, referring to temporal events: ${temporalInfo.temporalInfo.map(t => 
          `"${t.originalText}" (${t.resolvedDate?.toLocaleDateString() || 'unresolved'})`
        ).join(', ')}`
      : '';
    
    const enhancedContent = `${userContext} ${storageContext}: ${temporalInfo.processedContent}${temporalContext}`;
    
    console.log(`📝 Creating temporally-aware embedding for: ${userName}`);
    console.log(`🧠 Enhanced content: ${enhancedContent.substring(0, 150)}...`);
    
    // Generate embedding for the enhanced content (with user and temporal context)
    const embedding = await generateEmbedding(enhancedContent);

    // Store in Supabase with all temporal metadata
    const { data, error } = await supabase
      .from('knowledge_vectors')
      .insert({
        account_id: accountId,
        content: entry.content, // Original content for display
        enhanced_content: enhancedContent, // Enhanced content that was embedded
        processed_content: temporalInfo.processedContent, // Content with resolved temporal expressions
        tags: entry.tags,
        added_by: entry.addedBy,
        added_by_name: userName, // Use the resolved or provided name
        embedding: embedding,
        // Temporal intelligence fields
        temporal_info: temporalInfo.temporalInfo,
        resolved_dates: temporalInfo.resolvedDates,
        temporal_relevance_score: temporalInfo.temporalRelevanceScore,
        contains_temporal_refs: temporalInfo.containsTemporalRefs,
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

    if (temporalInfo.containsTemporalRefs) {
      console.log(`✅ Stored temporally-aware embedding for: ${userName}`);
      console.log(`🕒 Temporal refs: ${temporalInfo.temporalInfo.length}, relevance: ${temporalInfo.temporalRelevanceScore.toFixed(2)}`);
      console.log(`🕒 Resolved dates: ${temporalInfo.resolvedDates.map(d => d.toLocaleDateString()).join(', ')}`);
    } else {
      console.log(`✅ Stored embedding with user context for: ${userName}`);
    }
    
    return data.id;
  } catch (error) {
    console.error('Error in storeWithEmbedding:', error);
    throw error;
  }
}

/**
 * Update existing knowledge vector with new content and embedding
 * Enhanced with temporal intelligence and user context
 */
export async function updateWithEmbedding(
  id: string,
  updates: { content?: string; tags?: string[] }
): Promise<void> {
  try {
    let embedding: number[] | undefined;
    let enhancedContent: string | undefined;
    let processedContent: string | undefined;
    let temporalData: Record<string, unknown> = {};
    
    // Generate new embedding if content changed
    if (updates.content) {
      const updateDate = new Date();
      
      console.log(`📅 Update date: ${updateDate.toISOString()}`);
      console.log(`📅 Local update date: ${updateDate.toLocaleDateString()} ${updateDate.toLocaleTimeString()}`);
      
      // Get the existing entry to find out who added it
      const { data: existingEntry, error: fetchError } = await supabase
        .from('knowledge_vectors')
        .select('added_by, added_by_name, created_at')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching existing entry for update:', fetchError);
        throw new Error(`Failed to fetch existing entry: ${fetchError.message}`);
      }
      
      // Use cached name or fetch it if not available
      const userName = existingEntry.added_by_name || await getUserDisplayName(existingEntry.added_by);
      
      // Process temporal content using the update date as reference
      console.log(`🕒 Processing updated temporal content: "${updates.content}"`);
      console.log(`🕒 Using temporal reference date: ${updateDate.toISOString()}`);
      const temporalInfo = await processTemporalContent(updates.content, updateDate, new Date(existingEntry.created_at));
      
      // Create enhanced content with temporal awareness
      const userContext = `Added by ${userName}`;
      const updateContext = `on ${updateDate.toLocaleDateString('en-CA')}`; // YYYY-MM-DD format in local time
      const temporalContext = temporalInfo.containsTemporalRefs 
        ? `, referring to temporal events: ${temporalInfo.temporalInfo.map(t => 
            `"${t.originalText}" (${t.resolvedDate?.toLocaleDateString() || 'unresolved'})`
          ).join(', ')}`
        : '';
      
      enhancedContent = `${userContext} ${updateContext}: ${temporalInfo.processedContent}${temporalContext}`;
      processedContent = temporalInfo.processedContent;
      
      // Collect temporal data for update
      temporalData = {
        temporal_info: temporalInfo.temporalInfo,
        resolved_dates: temporalInfo.resolvedDates,
        temporal_relevance_score: temporalInfo.temporalRelevanceScore,
        contains_temporal_refs: temporalInfo.containsTemporalRefs,
      };
      
      console.log(`📝 Updating temporally-aware embedding for: ${userName}`);
      console.log(`🧠 Updated enhanced content: ${enhancedContent.substring(0, 150)}...`);
      embedding = await generateEmbedding(enhancedContent);
    }

    const updateData: Record<string, unknown> = { ...updates, ...temporalData };
    if (embedding) {
      updateData.embedding = embedding;
      updateData.enhanced_content = enhancedContent;
      updateData.processed_content = processedContent;
    }

    const { error } = await supabase
      .from('knowledge_vectors')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Supabase update error:', error);
      throw new Error(`Failed to update embedding: ${error.message}`);
    }
    
    console.log(`✅ Updated temporally-aware embedding`);
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