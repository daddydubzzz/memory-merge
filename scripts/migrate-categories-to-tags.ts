#!/usr/bin/env tsx

/**
 * Migration script to convert category-based knowledge entries to tag-based entries
 * 
 * Usage:
 * npx tsx scripts/migrate-categories-to-tags.ts
 * 
 * This script will:
 * 1. Fetch all knowledge entries from Firestore
 * 2. Convert categories to tags using CATEGORY_TO_TAGS_MAP
 * 3. Update Firestore entries with tags
 * 4. Migrate to vector database with new tag structure
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { config } from 'dotenv';
import { CATEGORY_TO_TAGS_MAP } from '../src/lib/constants';

// Load environment variables
config({ path: '.env.local' });

// Firebase configuration
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

interface LegacyKnowledgeEntry {
  id: string;
  content: string;
  category?: string;
  tags?: string[];
  addedBy: string;
  accountId: string;
  createdAt: any;
  updatedAt: any;
}

async function fetchAllEntries(): Promise<LegacyKnowledgeEntry[]> {
  console.log('📚 Fetching all knowledge entries from Firestore...');
  
  try {
    const knowledgeRef = collection(db, 'knowledge');
    const snapshot = await getDocs(knowledgeRef);
    
    const entries: LegacyKnowledgeEntry[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      entries.push({
        id: doc.id,
        content: data.content || '',
        category: data.category,
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

function migrateCategoryToTags(entry: LegacyKnowledgeEntry): string[] {
  // Start with existing tags if any
  let newTags = [...(entry.tags || [])];
  
  // Add tags from category mapping if category exists
  if (entry.category && CATEGORY_TO_TAGS_MAP[entry.category]) {
    const categoryTags = CATEGORY_TO_TAGS_MAP[entry.category];
    // Add category tags that aren't already present
    categoryTags.forEach(tag => {
      if (!newTags.includes(tag)) {
        newTags.push(tag);
      }
    });
  }
  
  // If no tags at all, use misc as fallback
  if (newTags.length === 0) {
    newTags = ['misc'];
  }
  
  return newTags;
}

async function updateEntryTags(entryId: string, tags: string[]): Promise<void> {
  try {
    const docRef = doc(db, 'knowledge', entryId);
    await updateDoc(docRef, { 
      tags,
      // Remove category field (optional, can keep for backward compatibility)
      // category: null
    });
  } catch (error) {
    console.error(`❌ Error updating entry ${entryId}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting category to tags migration...\n');
  
  try {
    // Fetch all entries
    const entries = await fetchAllEntries();
    
    if (entries.length === 0) {
      console.log('ℹ️  No entries found. Nothing to migrate.');
      return;
    }
    
    // Analyze what needs migration
    const needsMigration = entries.filter(entry => {
      // Needs migration if it has a category but no tags, or empty tags
      return entry.category && (!entry.tags || entry.tags.length === 0);
    });
    
    const alreadyHasTags = entries.filter(entry => entry.tags && entry.tags.length > 0);
    
    console.log(`📊 Migration Analysis:`);
    console.log(`   Total entries: ${entries.length}`);
    console.log(`   Already have tags: ${alreadyHasTags.length}`);
    console.log(`   Need migration: ${needsMigration.length}\n`);
    
    if (needsMigration.length === 0) {
      console.log('✅ All entries already have tags. No migration needed.');
      return;
    }
    
    // Process each entry that needs migration
    let successCount = 0;
    let errorCount = 0;
    
    console.log('🔄 Starting migration...\n');
    
    for (const entry of needsMigration) {
      try {
        const newTags = migrateCategoryToTags(entry);
        
        console.log(`📝 Migrating "${entry.content.substring(0, 50)}..."`);
        console.log(`   Category: "${entry.category}" → Tags: [${newTags.join(', ')}]`);
        
        await updateEntryTags(entry.id, newTags);
        successCount++;
        
        // Small delay to be nice to Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Failed to migrate entry ${entry.id}:`, error);
        errorCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${successCount} entries`);
    if (errorCount > 0) {
      console.log(`❌ Failed to migrate: ${errorCount} entries`);
    }
    
    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('1. Run the vector sync script: npx tsx scripts/sync-firestore-to-vectors.ts');
      console.log('2. Test the tag-based search functionality');
      console.log('3. Update your UI to use the new tag system');
    } else {
      console.log('\n⚠️  Migration completed with some errors. Check the logs above.');
    }
    
  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✨ Migration script completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
} 