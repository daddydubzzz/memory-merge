#!/usr/bin/env tsx

/**
 * Script to fix user names in existing knowledge entries
 * This script finds entries with "Unknown User" and regenerates the enhanced content
 * with the correct user name from either users or userProfiles collections
 */

import { supabase } from '../src/lib/supabase';
import { getUserDisplayName } from '../src/lib/knowledge/services/utility-service';
import { processTemporalContent } from '../src/lib/temporal-processor';
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

async function fixUserNames() {
  console.log('🔧 Starting user name fix...');
  
  try {
    // Find all entries with "Unknown User" in enhanced_content
    const { data: entries, error: fetchError } = await supabase
      .from('knowledge_vectors')
      .select('*')
      .like('enhanced_content', '%Unknown User%');
    
    if (fetchError) {
      throw new Error(`Failed to fetch entries: ${fetchError.message}`);
    }
    
    if (!entries || entries.length === 0) {
      console.log('✅ No entries with "Unknown User" found');
      return;
    }
    
    console.log(`📝 Found ${entries.length} entries to fix`);
    
    for (const entry of entries) {
      try {
        console.log(`\n🔄 Processing entry ${entry.id}`);
        console.log(`   User ID: ${entry.added_by}`);
        console.log(`   Current enhanced content: ${entry.enhanced_content?.substring(0, 100)}...`);
        
        // Get the correct user name
        const userName = await getUserDisplayName(entry.added_by);
        console.log(`   Resolved user name: "${userName}"`);
        
        // Skip if still unknown
        if (userName.includes('Unknown User') || userName.startsWith('User ')) {
          console.log(`   ⚠️ Could not resolve user name, skipping`);
          continue;
        }
        
        // Process temporal content
        const currentDate = new Date();
        const createdAt = new Date(entry.created_at);
        const temporalInfo = await processTemporalContent(entry.content, createdAt, createdAt);
        
        // Create new enhanced content
        const userContext = `Added by ${userName}`;
        const dateContext = `on ${createdAt.toISOString().split('T')[0]}`;
        const temporalContext = temporalInfo.containsTemporalRefs 
          ? `, referring to temporal events: ${temporalInfo.temporalInfo.map(t => 
              `"${t.originalText}" (${t.resolvedDate?.toLocaleDateString() || 'unresolved'})`
            ).join(', ')}`
          : '';
        
        const newEnhancedContent = `${userContext} ${dateContext}: ${temporalInfo.processedContent}${temporalContext}`;
        
        console.log(`   New enhanced content: ${newEnhancedContent.substring(0, 100)}...`);
        
        // Generate new embedding
        const newEmbedding = await generateEmbedding(newEnhancedContent);
        
        // Update the entry
        const { error: updateError } = await supabase
          .from('knowledge_vectors')
          .update({
            enhanced_content: newEnhancedContent,
            added_by_name: userName,
            embedding: newEmbedding,
            processed_content: temporalInfo.processedContent,
            temporal_info: temporalInfo.temporalInfo,
            resolved_dates: temporalInfo.resolvedDates,
            temporal_relevance_score: temporalInfo.temporalRelevanceScore,
            contains_temporal_refs: temporalInfo.containsTemporalRefs,
          })
          .eq('id', entry.id);
        
        if (updateError) {
          console.error(`   ❌ Error updating entry: ${updateError.message}`);
        } else {
          console.log(`   ✅ Successfully updated entry`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing entry ${entry.id}:`, error);
      }
    }
    
    console.log('\n🎉 User name fix completed!');
    
  } catch (error) {
    console.error('💥 Fix script failed:', error);
    process.exit(1);
  }
}

// Run the fix
if (require.main === module) {
  fixUserNames()
    .then(() => {
      console.log('✅ Fix script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fix script failed:', error);
      process.exit(1);
    });
}

export { fixUserNames }; 