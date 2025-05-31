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

// Synonym mapping for enriching stored content
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
 * Enrich content with synonyms for better searchability
 */
function enrichContentWithSynonyms(content: string): string {
  let enrichedContent = content;
  const foundSynonyms: string[] = [];
  
  for (const synonyms of Object.values(SYNONYM_GROUPS)) {
    for (const synonym of synonyms) {
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      if (regex.test(content)) {
        // Add some related synonyms to the content (not all to avoid spam)
        const relatedSynonyms = synonyms.filter(s => s !== synonym).slice(0, 3);
        foundSynonyms.push(...relatedSynonyms);
        console.log(`🔗 Found "${synonym}", adding related terms: [${relatedSynonyms.join(', ')}]`);
        break; // Only process one match per group
      }
    }
  }
  
  if (foundSynonyms.length > 0) {
    enrichedContent += ` [Related terms: ${foundSynonyms.join(', ')}]`;
  }
  
  return enrichedContent;
}

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
  entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'> & { 
    userTimezone?: string;
    clientStorageDate?: string; // ISO string from client in user's timezone
  }
): Promise<string> {
  try {
    // Use client-provided storage date (in user's timezone) if available
    // Otherwise fall back to server time
    const storageDate = entry.clientStorageDate 
      ? new Date(entry.clientStorageDate)
      : new Date();
    
    // For temporal processing, use the same date to ensure consistency
    // This ensures "tomorrow" gets resolved relative to when the user said it
    const temporalReferenceDate = storageDate;
    
    console.log(`📅 Storage date: ${storageDate.toISOString()}`);
    console.log(`📅 Client storage date: ${entry.clientStorageDate || 'not provided'}`);
    console.log(`📅 User timezone: ${entry.userTimezone || 'not provided'}`);
    
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
    
    // Use client storage date if provided (already in YYYY-MM-DD format from client's local timezone)
    // Otherwise format server date as fallback
    let storageDateFormatted: string;
    if (entry.clientStorageDate) {
      // Client sends date already formatted as YYYY-MM-DD in their local timezone
      storageDateFormatted = entry.clientStorageDate;
      console.log(`📅 Using client local date: ${storageDateFormatted}`);
    } else {
      // Fallback to server date formatting (this will be in UTC timezone)
      storageDateFormatted = storageDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      console.log(`📅 Using server date fallback: ${storageDateFormatted}`);
    }
    
    const storageContext = `on ${storageDateFormatted}`;
    const temporalContext = temporalInfo.containsTemporalRefs 
      ? `, referring to temporal events: ${temporalInfo.temporalInfo.map(t => 
          `"${t.originalText}" (${t.resolvedDate?.toLocaleDateString() || 'unresolved'})`
        ).join(', ')}`
      : '';
    
    // Enrich content with synonyms for better searchability  
    const synonymEnrichedContent = enrichContentWithSynonyms(temporalInfo.processedContent);
    
    const enhancedContent = `${userContext} ${storageContext}: ${synonymEnrichedContent}${temporalContext}`;
    
    console.log(`📝 Creating temporally-aware embedding for: ${userName}`);
    console.log(`🧠 Enhanced content: ${enhancedContent.substring(0, 150)}...`);
    
    // Generate embedding with enriched content
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