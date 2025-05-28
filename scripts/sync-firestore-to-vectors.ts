#!/usr/bin/env tsx

/**
 * Migration script to sync existing Firestore knowledge entries to Supabase vectors
 * 
 * Usage:
 * npx tsx scripts/sync-firestore-to-vectors.ts
 * 
 * This script will:
 * 1. Fetch all knowledge entries from Firestore
 * 2. Generate embeddings for each entry
 * 3. Store them in Supabase knowledge_vectors table
 * 4. Report progress and any errors
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { config } from 'dotenv';
import { batchGenerateEmbeddings } from '../src/lib/embedding';
import { supabase } from '../src/lib/supabase';

// Load environment variables
config({ path: '.env.local' });

// Firebase configuration (same as your app)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface FirestoreKnowledgeEntry {
  id: string;
  content: string;
  category: string;
  tags: string[];
  addedBy: string;
  accountId: string;
  createdAt: any;
  updatedAt: any;
}

async function fetchFirestoreEntries(): Promise<FirestoreKnowledgeEntry[]> {
  console.log('📚 Fetching all knowledge entries from Firestore...');
  
  try {
    const knowledgeRef = collection(db, 'knowledge');
    const snapshot = await getDocs(knowledgeRef);
    
    const entries: FirestoreKnowledgeEntry[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      entries.push({
        id: doc.id,
        content: data.content || '',
        category: data.category || 'Other',
        tags: data.tags || [],
        addedBy: data.addedBy || '',
        accountId: data.accountId || data.coupleId || '', // Handle legacy coupleId
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });
    
    console.log(`✅ Found ${entries.length} entries in Firestore`);
    return entries;
  } catch (error) {
    console.error('❌ Error fetching from Firestore:', error);
    throw error;
  }
}

async function checkExistingVectors(): Promise<Set<string>> {
  console.log('🔍 Checking existing vectors in Supabase...');
  
  try {
    const { data, error } = await supabase
      .from('knowledge_vectors')
      .select('id');
    
    if (error) {
      console.error('❌ Error checking existing vectors:', error);
      return new Set();
    }
    
    const existingIds = new Set(data?.map(item => item.id) || []);
    console.log(`✅ Found ${existingIds.size} existing vectors`);
    return existingIds;
  } catch (error) {
    console.error('❌ Error checking existing vectors:', error);
    return new Set();
  }
}

async function syncBatch(entries: FirestoreKnowledgeEntry[]): Promise<void> {
  if (entries.length === 0) return;
  
  console.log(`🔄 Processing batch of ${entries.length} entries...`);
  
  try {
    // Generate embeddings for all content in this batch
    const contents = entries.map(entry => entry.content);
    const embeddings = await batchGenerateEmbeddings(contents);
    
    // Prepare data for insertion
    const insertData = entries.map((entry, index) => ({
      id: entry.id, // Use Firestore ID
      account_id: entry.accountId,
      content: entry.content,
      category: entry.category,
      tags: entry.tags,
      added_by: entry.addedBy,
      embedding: embeddings[index],
      // Convert Firestore timestamps to ISO strings
      created_at: entry.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updated_at: entry.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    }));
    
    // Insert into Supabase
    const { error } = await supabase
      .from('knowledge_vectors')
      .upsert(insertData, { onConflict: 'id' });
    
    if (error) {
      console.error('❌ Error inserting batch:', error);
      throw error;
    }
    
    console.log(`✅ Successfully synced batch of ${entries.length} entries`);
  } catch (error) {
    console.error('❌ Error processing batch:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting Firestore to Supabase Vector sync...\n');
  
  try {
    // Fetch all entries from Firestore
    const firestoreEntries = await fetchFirestoreEntries();
    
    if (firestoreEntries.length === 0) {
      console.log('ℹ️  No entries found in Firestore. Nothing to sync.');
      return;
    }
    
    // Check which entries already exist in Supabase
    const existingVectors = await checkExistingVectors();
    
    // Filter out entries that already exist
    const newEntries = firestoreEntries.filter(entry => !existingVectors.has(entry.id));
    
    if (newEntries.length === 0) {
      console.log('ℹ️  All entries already exist in Supabase. Nothing to sync.');
      return;
    }
    
    console.log(`📊 Will sync ${newEntries.length} new entries (${firestoreEntries.length - newEntries.length} already exist)\n`);
    
    // Process in batches to avoid overwhelming the API
    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < newEntries.length; i += BATCH_SIZE) {
      batches.push(newEntries.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 Processing ${batches.length} batches of up to ${BATCH_SIZE} entries each...\n`);
    
    // Process each batch
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        await syncBatch(batch);
        successCount += batch.length;
        console.log(`Progress: ${i + 1}/${batches.length} batches completed\n`);
        
        // Add a small delay between batches to be nice to the APIs
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Failed to process batch ${i + 1}:`, error);
        errorCount += batch.length;
      }
    }
    
    console.log('\n📊 Sync Summary:');
    console.log(`✅ Successfully synced: ${successCount} entries`);
    if (errorCount > 0) {
      console.log(`❌ Failed to sync: ${errorCount} entries`);
    }
    console.log(`📝 Total processed: ${successCount + errorCount} entries`);
    
    if (errorCount === 0) {
      console.log('\n🎉 All entries synced successfully!');
    } else {
      console.log('\n⚠️  Some entries failed to sync. Check the errors above.');
    }
    
  } catch (error) {
    console.error('💥 Fatal error during sync:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✨ Sync completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Sync failed:', error);
      process.exit(1);
    });
} 