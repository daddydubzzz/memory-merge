#!/usr/bin/env tsx

/**
 * Migration script to add temporal intelligence to existing knowledge entries
 * 
 * This script:
 * 1. Fetches all existing knowledge entries without temporal data
 * 2. Processes each entry for temporal expressions
 * 3. Updates the entries with temporal metadata
 * 4. Regenerates embeddings with temporal context
 * 
 * Usage: npm run migrate:temporal
 */

import { supabase } from '../src/lib/supabase';
import { processTemporalContent } from '../src/lib/temporal-processor';
import { getUserDisplayName } from '../src/lib/knowledge/services/utility-service';
import OpenAI from 'openai';

// Create OpenAI client
function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAI({ apiKey });
}

// Generate embedding for enhanced content
async function generateEmbedding(text: string): Promise<number[]> {
  const openai = createOpenAIClient();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.replace(/\n/g, ' '),
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

interface KnowledgeEntry {
  id: string;
  content: string;
  enhanced_content?: string;
  added_by: string;
  added_by_name?: string;
  created_at: string;
  account_id: string;
  tags: string[];
  temporal_info?: any;
  contains_temporal_refs?: boolean;
}

async function migrateTemporalIntelligence() {
  console.log('🚀 Starting temporal intelligence migration...');
  
  try {
    // First, run the database migration
    console.log('📊 Running database schema migration...');
    
    // Read and execute the SQL migration
    const fs = await import('fs');
    const path = await import('path');
    const migrationSQL = fs.readFileSync(
      path.join(process.cwd(), 'supabase-temporal-migration.sql'), 
      'utf8'
    );
    
    // Execute the migration (note: this might need to be done manually in Supabase dashboard)
    console.log('⚠️  Please run the following SQL in your Supabase dashboard:');
    console.log('📄 File: supabase-temporal-migration.sql');
    console.log('🔗 Or copy the SQL from the file and execute it manually');
    
    // Fetch all entries that don't have temporal processing yet
    console.log('🔍 Fetching entries without temporal intelligence...');
    
    const { data: entries, error: fetchError } = await supabase
      .from('knowledge_vectors')
      .select('*')
      .is('temporal_info', null)
      .order('created_at', { ascending: true });
    
    if (fetchError) {
      throw new Error(`Failed to fetch entries: ${fetchError.message}`);
    }
    
    if (!entries || entries.length === 0) {
      console.log('✅ No entries found that need temporal migration');
      return;
    }
    
    console.log(`📝 Found ${entries.length} entries to process`);
    
    let processed = 0;
    let withTemporal = 0;
    let errors = 0;
    
    // Process entries in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)}`);
      
      await Promise.all(batch.map(async (entry: KnowledgeEntry) => {
        try {
          const createdAt = new Date(entry.created_at);
          
          // Process temporal content
          const temporalInfo = await processTemporalContent(entry.content, createdAt, createdAt);
          
          // Get user display name
          const userName = entry.added_by_name || await getUserDisplayName(entry.added_by);
          
          // Create enhanced content with temporal awareness
          const userContext = `Added by ${userName}`;
          const dateContext = `on ${createdAt.toISOString().split('T')[0]}`;
          const temporalContext = temporalInfo.containsTemporalRefs 
            ? `, referring to temporal events: ${temporalInfo.temporalInfo.map(t => 
                `"${t.originalText}" (${t.resolvedDate?.toLocaleDateString() || 'unresolved'})`
              ).join(', ')}`
            : '';
          
          const enhancedContent = `${userContext} ${dateContext}: ${temporalInfo.processedContent}${temporalContext}`;
          
          // Generate new embedding with temporal context
          const embedding = await generateEmbedding(enhancedContent);
          
          // Update the entry
          const { error: updateError } = await supabase
            .from('knowledge_vectors')
            .update({
              enhanced_content: enhancedContent,
              processed_content: temporalInfo.processedContent,
              added_by_name: userName,
              embedding: embedding,
              temporal_info: temporalInfo.temporalInfo,
              resolved_dates: temporalInfo.resolvedDates,
              temporal_relevance_score: temporalInfo.temporalRelevanceScore,
              contains_temporal_refs: temporalInfo.containsTemporalRefs,
            })
            .eq('id', entry.id);
          
          if (updateError) {
            console.error(`❌ Error updating entry ${entry.id}:`, updateError.message);
            errors++;
          } else {
            processed++;
            if (temporalInfo.containsTemporalRefs) {
              withTemporal++;
              console.log(`🕒 Processed temporal entry: "${entry.content.substring(0, 50)}..." (${temporalInfo.temporalInfo.length} temporal refs)`);
            } else {
              console.log(`📝 Processed entry: "${entry.content.substring(0, 50)}..."`);
            }
          }
          
        } catch (error) {
          console.error(`❌ Error processing entry ${entry.id}:`, error);
          errors++;
        }
      }));
      
      // Small delay between batches to be nice to the APIs
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n🎉 Migration completed!');
    console.log(`📊 Statistics:`);
    console.log(`   • Total entries processed: ${processed}`);
    console.log(`   • Entries with temporal intelligence: ${withTemporal}`);
    console.log(`   • Errors: ${errors}`);
    console.log(`   • Success rate: ${((processed / entries.length) * 100).toFixed(1)}%`);
    
    if (withTemporal > 0) {
      console.log(`\n🕒 Temporal intelligence features now available:`);
      console.log(`   • Smart date resolution (tomorrow → actual dates)`);
      console.log(`   • Temporal context in AI responses`);
      console.log(`   • Time-aware search and filtering`);
      console.log(`   • Recurring event detection`);
    }
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  migrateTemporalIntelligence()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateTemporalIntelligence }; 