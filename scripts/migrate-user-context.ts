#!/usr/bin/env ts-node

/**
 * Migration script to enhance existing knowledge entries with user context
 * This script:
 * 1. Fetches all existing knowledge entries from Supabase
 * 2. For each entry, gets the user's display name 
 * 3. Creates enhanced content with "Added by [UserName]: [content]"
 * 4. Regenerates embeddings with the enhanced content
 * 5. Updates the database with enhanced_content and added_by_name fields
 */

import { supabase } from '../src/lib/supabase';
import { getUserDisplayName } from '../src/lib/knowledge/services/utility-service';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Create OpenAI client
function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAI({ apiKey });
}

// Generate embedding for text
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = createOpenAIClient();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' '),
      encoding_format: 'float',
    });

    if (!response.data[0]?.embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function migrateUserContext() {
  try {
    console.log('🚀 Starting user context migration...');
    
    // Fetch all entries that don't have enhanced_content yet
    const { data: entries, error: fetchError } = await supabase
      .from('knowledge_vectors')
      .select('*')
      .is('enhanced_content', null);

    if (fetchError) {
      throw new Error(`Failed to fetch entries: ${fetchError.message}`);
    }

    if (!entries || entries.length === 0) {
      console.log('✅ No entries need migration. All entries already have user context.');
      return;
    }

    console.log(`📊 Found ${entries.length} entries to migrate`);

    let successCount = 0;
    let errorCount = 0;

    // Process entries in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      console.log(`\n🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)}`);
      
      await Promise.all(batch.map(async (entry) => {
        try {
          console.log(`📝 Processing entry ${entry.id}...`);
          
          // Get user display name
          const userName = await getUserDisplayName(entry.added_by);
          console.log(`👤 User: ${userName}`);
          
          // Create enhanced content
          const enhancedContent = `Added by ${userName}: ${entry.content}`;
          
          // Generate new embedding with user context
          console.log(`🧠 Generating embedding with user context...`);
          const embedding = await generateEmbedding(enhancedContent);
          
          // Update the entry
          const { error: updateError } = await supabase
            .from('knowledge_vectors')
            .update({
              enhanced_content: enhancedContent,
              added_by_name: userName,
              embedding: embedding
            })
            .eq('id', entry.id);

          if (updateError) {
            throw new Error(`Update failed: ${updateError.message}`);
          }

          console.log(`✅ Successfully migrated entry ${entry.id}`);
          successCount++;
          
        } catch (error) {
          console.error(`❌ Failed to migrate entry ${entry.id}:`, error);
          errorCount++;
        }
      }));
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < entries.length) {
        console.log('⏳ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n🎉 Migration completed!');
    console.log(`✅ Successfully migrated: ${successCount} entries`);
    console.log(`❌ Failed migrations: ${errorCount} entries`);
    
    if (errorCount > 0) {
      console.log('⚠️  Some entries failed to migrate. Check the error logs above.');
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  migrateUserContext()
    .then(() => {
      console.log('🏁 Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateUserContext }; 