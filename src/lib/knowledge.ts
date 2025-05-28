import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import { cache, cacheKeys } from './cache';
import { db } from './firebase'; // Import from existing firebase.ts
import type { KnowledgeEntry } from './constants';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface Account {
  id?: string;
  members: string[];
  createdAt: Date;
  settings: {
    allowNotifications: boolean;
    timezone: string;
  };
}

// Helper function to call API routes
async function callKnowledgeAPI(action: string, data: any) {
  const response = await fetch('/api/knowledge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...data }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API call failed');
  }

  return response.json();
}

// Helper function to call search API routes
async function callSearchAPI(action: string, data: any) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...data }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Search API call failed');
  }

  return response.json();
}

export class KnowledgeService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  // Store new knowledge entry with vector embedding and revision support
  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>): Promise<string> {
    try {
      // Set default intent if not specified
      const entryWithDefaults = {
        ...entry,
        intent: entry.intent || 'create' as const,
        timestamp: entry.timestamp || new Date().toISOString()
      };

      console.log('🔄 Adding knowledge entry:', {
        intent: entryWithDefaults.intent,
        content: entryWithDefaults.content,
        replaces: entryWithDefaults.replaces,
        timestamp: entryWithDefaults.timestamp
      });

      // Handle revision logic for updates
      if (entryWithDefaults.intent === 'update' && entryWithDefaults.replaces) {
        console.log('🔄 Processing update - calling handleMemoryReplacement');
        await this.handleMemoryReplacement(entryWithDefaults.replaces, entryWithDefaults.timestamp);
      } else {
        console.log('🔄 Not an update or no replaces field:', { 
          intent: entryWithDefaults.intent, 
          replaces: entryWithDefaults.replaces 
        });
      }

      // Try to store with vector embedding first via API
      try {
        const result = await callKnowledgeAPI('store', {
          accountId: this.accountId,
          entry: entryWithDefaults
        });
        
        console.log('Stored with vector embedding:', result.id);
        
        // Also store in Firestore for backup/compatibility
        await this.addKnowledgeFirestore(entryWithDefaults);
        
        // Invalidate caches since we added new data
        cache.invalidatePattern(this.accountId);
        
        return result.id;
      } catch (vectorError) {
        console.warn('Vector storage failed, using Firestore only:', vectorError);
        // Fallback to Firestore only
        const id = await this.addKnowledgeFirestore(entryWithDefaults);
        
        // Invalidate caches for fallback too
        cache.invalidatePattern(this.accountId);
        
        return id;
      }
    } catch (error) {
      console.error('Error adding knowledge:', error);
      throw error;
    }
  }

  // Handle memory replacement logic - improved to handle Firestore null/undefined differences
  private async handleMemoryReplacement(replaces: string, newTimestamp: string): Promise<void> {
    try {
      console.log(`🔄 handleMemoryReplacement called with replaces: "${replaces}"`);
      
      // First try to find by exact ID
      let entriesToReplace: KnowledgeEntry[] = [];
      
      try {
        // If replaces looks like an ID, try to find by ID
        if (replaces.length > 10) {
          const knowledgeRef = collection(db, 'knowledge');
          const idQuery = query(
            knowledgeRef,
            where('accountId', '==', this.accountId),
            where('__name__', '==', replaces)
          );
          const idSnapshot = await getDocs(idQuery);
          entriesToReplace = idSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          })) as KnowledgeEntry[];
          console.log(`🔍 ID search for "${replaces}": found ${entriesToReplace.length} entries`);
        }
      } catch (error) {
        console.warn('ID lookup failed, trying tag search:', error);
      }

      // If no ID match found, search by tag concept (improved approach)
      if (entriesToReplace.length === 0) {
        const knowledgeRef = collection(db, 'knowledge');
        
        // Create multiple search strategies for better matching
        const searchStrategies = [
          replaces, // Exact match: "family-reunion"
          replaces.replace(/-/g, ' '), // With spaces: "family reunion"  
          ...replaces.split('-'), // Individual parts: ["family", "reunion"]
        ].filter(Boolean);

        console.log(`🔍 Searching with strategies:`, searchStrategies);

        // Try each search strategy
        for (const searchTerm of searchStrategies) {
          try {
            const tagQuery = query(
              knowledgeRef,
              where('accountId', '==', this.accountId),
              where('tags', 'array-contains', searchTerm),
              orderBy('createdAt', 'desc')
            );
            
            const tagSnapshot = await getDocs(tagQuery);
            const foundEntries = tagSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate() || new Date(),
              updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            })) as KnowledgeEntry[];
            
            console.log(`🔍 Tag search for "${searchTerm}": found ${foundEntries.length} entries`);
            
            // Filter to only non-replaced entries and add to results
            const nonReplacedEntries = foundEntries.filter(entry => !entry.replaced_by);
            entriesToReplace.push(...nonReplacedEntries);
            
            // If we found matches, stop searching
            if (nonReplacedEntries.length > 0) {
              console.log(`✅ Found ${nonReplacedEntries.length} entries to replace with search term: ${searchTerm}`);
              break;
            }
          } catch (error) {
            console.warn(`Tag search failed for "${searchTerm}":`, error);
          }
        }
      }

      // Mark all found entries as replaced
      for (const entryToReplace of entriesToReplace) {
        if (entryToReplace.id) {
          console.log(`🔄 Marking entry ${entryToReplace.id} as replaced:`, {
            content: entryToReplace.content.substring(0, 50) + '...',
            tags: entryToReplace.tags,
            willBeReplacedBy: newTimestamp
          });
          
          await this.updateKnowledge(entryToReplace.id, {
            replaced_by: newTimestamp
          });
          console.log(`✅ Successfully marked entry ${entryToReplace.id} as replaced by ${newTimestamp}`);
        }
      }

      if (entriesToReplace.length > 0) {
        console.log(`✅ Successfully replaced ${entriesToReplace.length} entries for: ${replaces}`);
      } else {
        console.log(`⚠️ No existing entries found to replace for: ${replaces}`);
      }
    } catch (error) {
      console.error('❌ Error handling memory replacement:', error);
      // Don't throw - allow the new entry to be stored even if replacement fails
    }
  }

  // Original Firestore storage method (kept as fallback) - filters undefined revision fields
  private async addKnowledgeFirestore(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>): Promise<string> {
    // Filter out undefined revision fields for Firestore compatibility
    const cleanEntry = {
      content: entry.content,
      tags: entry.tags,
      addedBy: entry.addedBy,
      accountId: this.accountId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Initialize revision fields properly for Firestore
      intent: entry.intent || 'create',
      timestamp: entry.timestamp || new Date().toISOString(),
      replaced_by: null, // Explicitly set to null for consistent Firestore queries
      // Only include replaces if it exists
      ...(entry.replaces && { replaces: entry.replaces }),
      // Include shopping list fields if they exist
      ...(entry.items && { items: entry.items }),
      ...(entry.listType && { listType: entry.listType })
    };

    const docRef = await addDoc(collection(db, 'knowledge'), cleanEntry);
    return docRef.id;
  }

  // Enhanced search using vector similarity with tag-based filtering, caching, and revision support
  async searchKnowledge(searchTerms: string[], tags?: string[], includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    const searchQuery = searchTerms.join(' ');
    const cacheKey = cacheKeys.searchResults(this.accountId, searchQuery, tags);
    
    // Check cache first (2 minute TTL for search results)
    const cached = cache.get<KnowledgeEntry[]>(cacheKey);
    if (cached) {
      console.log('🔍 Search results served from cache');
      return this.filterSupersededEntries(cached, includeSuperseded);
    }

    try {
      // Try vector search first via API
      try {
        const result = await callSearchAPI('search', {
          accountId: this.accountId,
          query: searchQuery,
          tags, // Pass tags for filtering
          options: {
            matchThreshold: 0.4, // Lower threshold for more results
            matchCount: 20,
            minResults: 3
          }
        });

        // Convert search results to KnowledgeEntry format
        const knowledgeEntries: KnowledgeEntry[] = result.results.map((vectorResult: any) => ({
          id: vectorResult.id,
          content: vectorResult.content,
          tags: vectorResult.tags,
          addedBy: vectorResult.addedBy,
          createdAt: new Date(vectorResult.createdAt),
          updatedAt: new Date(vectorResult.updatedAt),
          accountId: this.accountId,
          // Map revision fields if they exist
          timestamp: vectorResult.timestamp,
          replaces: vectorResult.replaces,
          replaced_by: vectorResult.replaced_by,
          intent: vectorResult.intent
        }));

        // If we have good vector results, cache and return them
        if (knowledgeEntries.length > 0) {
          cache.set(cacheKey, knowledgeEntries, 2); // 2 minute cache
          console.log(`🔍 Vector search found ${knowledgeEntries.length} results`);
          return this.filterSupersededEntries(knowledgeEntries, includeSuperseded);
        }
      } catch (vectorError) {
        console.warn('Vector search failed, falling back to Firestore:', vectorError);
      }

      // Fallback to original Firestore search with tag filtering
      const results = await this.searchKnowledgeFirestore(searchTerms, tags, includeSuperseded);
      
      // Cache Firestore results too (shorter TTL)
      cache.set(cacheKey, results, 1); // 1 minute cache for fallback
      
      return results;

    } catch (error) {
      console.error('Error searching knowledge:', error);
      return [];
    }
  }

  // Filter out superseded entries unless explicitly requested - robust against null/undefined
  private filterSupersededEntries(entries: KnowledgeEntry[], includeSuperseded: boolean): KnowledgeEntry[] {
    if (includeSuperseded) {
      console.log(`🔍 Including all entries (${entries.length} total, including superseded)`);
      return entries;
    }
    
    const currentEntries = entries.filter(entry => {
      const isSuperseded = entry.replaced_by && entry.replaced_by.trim() !== '';
      return !isSuperseded;
    });
    
    console.log(`🔍 Filtered entries: ${currentEntries.length} current out of ${entries.length} total`);
    
    // Additional debug logging for revision tracking
    if (entries.length > currentEntries.length) {
      const supersededEntries = entries.filter(entry => entry.replaced_by && entry.replaced_by.trim() !== '');
      console.log(`📝 Superseded entries filtered out:`, supersededEntries.map(e => ({
        id: e.id,
        content: e.content.substring(0, 50) + '...',
        replaced_by: e.replaced_by
      })));
    }
    
    return currentEntries;
  }

  // Updated Firestore search method with tag-based filtering and robust revision support
  private async searchKnowledgeFirestore(searchTerms: string[], tags?: string[], includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    const knowledgeRef = collection(db, 'knowledge');
    let q = query(
      knowledgeRef,
      where('accountId', '==', this.accountId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    // Use tag-based filtering if tags are provided
    if (tags && tags.length > 0) {
      q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains-any', tags),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    }

    const snapshot = await getDocs(q);
    const entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as KnowledgeEntry[];

    // Client-side filtering for text search
    let filteredEntries = entries;
    if (searchTerms.length > 0) {
      filteredEntries = entries.filter(entry => {
        const searchText = `${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
        return searchTerms.some(term => 
          searchText.includes(term.toLowerCase())
        );
      });
    }

    // Always apply superseded filtering (robust against null/undefined)
    return this.filterSupersededEntries(filteredEntries, includeSuperseded);
  }

  // Get recent knowledge entries with caching, efficient API calls, and revision support
  async getRecentKnowledge(limitCount: number = 10, includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    const cacheKey = cacheKeys.recentEntries(this.accountId, limitCount);
    
    // Check cache first (5 minute TTL)
    const cached = cache.get<KnowledgeEntry[]>(cacheKey);
    if (cached) {
      console.log('📚 Recent entries served from cache');
      return this.filterSupersededEntries(cached, includeSuperseded);
    }

    try {
      // Try efficient Supabase API first
      try {
        const result = await callSearchAPI('recent', {
          accountId: this.accountId,
          options: { limit: limitCount }
        });

        const entries: KnowledgeEntry[] = result.results.map((item: any) => ({
          id: item.id,
          content: item.content,
          tags: item.tags,
          addedBy: item.addedBy,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
          accountId: this.accountId,
          // Map revision fields if they exist
          timestamp: item.timestamp,
          replaces: item.replaces,
          replaced_by: item.replaced_by,
          intent: item.intent
        }));

        // Cache for 5 minutes
        cache.set(cacheKey, entries, 5);
        console.log('📚 Recent entries loaded from Supabase API');
        return this.filterSupersededEntries(entries, includeSuperseded);

      } catch (apiError) {
        console.warn('Supabase API failed, falling back to Firestore:', apiError);
      }

      // Fallback to direct Firestore query
      const knowledgeRef = collection(db, 'knowledge');
      const q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      // Cache for 3 minutes (shorter for fallback)
      cache.set(cacheKey, entries, 3);
      console.log('📚 Recent entries loaded from Firestore fallback');
      
      return this.filterSupersededEntries(entries, includeSuperseded);
    } catch (error) {
      console.error('Error getting recent knowledge:', error);
      return [];
    }
  }

  // Get only current (latest) memories for a given tag - excludes superseded entries
  async getCurrentMemories(tag: string): Promise<KnowledgeEntry[]> {
    try {
      const knowledgeRef = collection(db, 'knowledge');
      const q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains', tag),
        where('replaced_by', '==', null), // Only current entries
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      console.log(`📌 Found ${entries.length} current memories for tag: ${tag}`);
      return entries;
    } catch (error) {
      console.error('Error getting current memories:', error);
      return [];
    }
  }

  // Get active shopping list items - specifically for shopping list queries
  async getActiveShoppingList(): Promise<KnowledgeEntry[]> {
    try {
      console.log('🛍️ Getting active shopping list items');
      
      const knowledgeRef = collection(db, 'knowledge');
      const q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains-any', ['shopping', 'groceries']),
        where('replaced_by', '==', null), // Only active (not cleared/purchased) entries
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      // Additional filtering to exclude purchase records and clear records
      const activeShoppingItems = entries.filter(entry => {
        const hasShoppingIntent = !entry.intent || ['store', 'create'].includes(entry.intent);
        const isNotPurchaseRecord = !entry.tags?.includes('purchased');
        const isNotClearRecord = !entry.tags?.includes('cleared');
        
        return hasShoppingIntent && isNotPurchaseRecord && isNotClearRecord;
      });

      console.log(`🛍️ Found ${activeShoppingItems.length} active shopping items out of ${entries.length} total shopping entries`);
      
      if (activeShoppingItems.length > 0) {
        console.log('🛍️ Active shopping items:', activeShoppingItems.map(item => ({
          content: item.content,
          tags: item.tags,
          replaced_by: item.replaced_by
        })));
      }
      
      return activeShoppingItems;
    } catch (error) {
      console.error('❌ Error getting active shopping list:', error);
      return [];
    }
  }

  // Handle item purchase - mark matching shopping list items as purchased
  async handleItemPurchase(purchasedItems: string[], tags: string[]): Promise<void> {
    try {
      console.log(`🛒 Processing purchase of items:`, purchasedItems);
      
      // First, find active shopping list entries that match the purchased items
      const knowledgeRef = collection(db, 'knowledge');
      const shoppingQuery = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains-any', ['shopping', 'groceries']),
        where('replaced_by', '==', null), // Only active entries
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(shoppingQuery);
      const activeShoppingEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      console.log(`🔍 Found ${activeShoppingEntries.length} active shopping entries`);

      // Smart matching: find entries that contain the purchased items
      const entriesToProcess: KnowledgeEntry[] = [];
      
      for (const entry of activeShoppingEntries) {
        const entryItems = entry.items || this.extractItemsFromContent(entry.content);
        
        // Check if any purchased items match items in this entry
        const hasMatchingItems = purchasedItems.some(purchasedItem => 
          entryItems.some(entryItem => 
            this.itemsMatch(purchasedItem, entryItem)
          )
        );

        if (hasMatchingItems) {
          entriesToProcess.push(entry);
        }
      }

      console.log(`🎯 Found ${entriesToProcess.length} entries to process for purchases`);

      const timestamp = new Date().toISOString();

      // Process each matching entry
      for (const entry of entriesToProcess) {
        if (entry.id) {
          const entryItems = entry.items || this.extractItemsFromContent(entry.content);
          
          // Find remaining items (not purchased)
          const remainingItems = entryItems.filter(entryItem => 
            !purchasedItems.some(purchasedItem => 
              this.itemsMatch(purchasedItem, entryItem)
            )
          );

          console.log(`🔄 Processing entry: ${entry.content.substring(0, 50)}...`);
          console.log(`📝 Original items:`, entryItems);
          console.log(`🛒 Purchased items:`, purchasedItems);
          console.log(`📋 Remaining items:`, remainingItems);

          // Mark the original entry as superseded
          await this.updateKnowledge(entry.id, {
            replaced_by: timestamp
          });
          console.log(`✅ Marked original entry as superseded: ${entry.id}`);

          // If there are remaining items, create a new entry for them
          if (remainingItems.length > 0) {
            const remainingContent = `Need ${remainingItems.join(', ')} from the store`;
            
            await this.addKnowledge({
              content: remainingContent,
              tags: entry.tags.filter(tag => !['purchased', 'cleared'].includes(tag)), // Keep original tags but remove purchase/clear tags
              addedBy: entry.addedBy,
              intent: 'create',
              items: remainingItems,
              listType: entry.listType || 'shopping',
              timestamp: timestamp
            });
            
            console.log(`✅ Created new entry for remaining items: ${remainingContent}`);
          } else {
            console.log(`ℹ️ No remaining items, shopping list is now empty`);
          }
        }
      }

      // Store the purchase record
      await this.addKnowledge({
        content: `Purchased ${purchasedItems.join(', ')}`,
        tags: ['shopping', 'purchased', ...tags.filter(tag => !['shopping', 'purchased'].includes(tag))],
        addedBy: 'system', // This should be updated to use actual user
        intent: 'purchase',
        items: purchasedItems,
        timestamp: timestamp
      });

      console.log(`✅ Created purchase record for: ${purchasedItems.join(', ')}`);
    } catch (error) {
      console.error('❌ Error handling item purchase:', error);
      throw error;
    }
  }

  // Clear shopping list - mark all active shopping list items as inactive
  async clearShoppingList(listType: string): Promise<void> {
    try {
      console.log(`🗑️ Clearing ${listType} list`);
      
      const knowledgeRef = collection(db, 'knowledge');
      const listQuery = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains', listType),
        where('replaced_by', '==', null), // Only active entries
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(listQuery);
      const activeEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      console.log(`🔍 Found ${activeEntries.length} active ${listType} entries to clear`);

      const timestamp = new Date().toISOString();
      
      // Mark all entries as cleared
      for (const entry of activeEntries) {
        if (entry.id) {
          await this.updateKnowledge(entry.id, {
            replaced_by: timestamp
          });
          console.log(`✅ Cleared list item: ${entry.content.substring(0, 50)}...`);
        }
      }

      // Store the clear list record
      await this.addKnowledge({
        content: `Cleared ${listType} list`,
        tags: [listType, 'cleared'],
        addedBy: 'system', // This should be updated to use actual user
        intent: 'clear_list',
        listType: listType,
        timestamp: timestamp
      });

      console.log(`✅ Successfully cleared ${activeEntries.length} items from ${listType} list`);
    } catch (error) {
      console.error('❌ Error clearing shopping list:', error);
      throw error;
    }
  }

  // Helper method to extract items from content text
  private extractItemsFromContent(content: string): string[] {
    // Handle different content formats
    const text = content.toLowerCase().trim();
    
    // Pattern 1: "need eggs, milk, fruit, cheese, and bread from the store"
    const needPattern = /(?:need|add|buy|get)\s+([^.!?]+?)(?:\s+from|$)/i;
    const needMatch = text.match(needPattern);
    
    if (needMatch) {
      return this.parseItemList(needMatch[1]);
    }
    
    // Pattern 2: Direct item list (fallback)
    // Split by common separators and clean up
    return this.parseItemList(text);
  }

  // Helper method to parse a comma/and separated item list
  private parseItemList(itemText: string): string[] {
    return itemText
      .split(/,|\band\b/)
      .map(item => item.trim().toLowerCase())
      .filter(item => item.length > 0 && !['from', 'the', 'store', 'shop'].includes(item));
  }

  // Helper method for smart item matching
  private itemsMatch(purchasedItem: string, listItem: string): boolean {
    const purchased = purchasedItem.toLowerCase().trim();
    const listed = listItem.toLowerCase().trim();
    
    // Exact match
    if (purchased === listed) return true;
    
    // Partial matches for common variations
    // "cheese" matches "sliced cheese", "cheddar cheese", etc.
    if (listed.includes(purchased) || purchased.includes(listed)) return true;
    
    // Common substitutions
    const substitutions: Record<string, string[]> = {
      'milk': ['whole milk', 'skim milk', '2% milk'],
      'cheese': ['sliced cheese', 'cheddar cheese', 'swiss cheese'],
      'bread': ['white bread', 'wheat bread', 'whole grain bread'],
      'butter': ['salted butter', 'unsalted butter']
    };
    
    for (const [base, variants] of Object.entries(substitutions)) {
      if ((purchased === base && variants.some(v => listed.includes(v))) ||
          (listed === base && variants.some(v => purchased.includes(v)))) {
        return true;
      }
    }
    
    return false;
  }

  // Get knowledge by specific tags with revision support
  async getKnowledgeByTags(tags: string[], includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    try {
      const knowledgeRef = collection(db, 'knowledge');
      let q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains-any', tags),
        orderBy('createdAt', 'desc')
      );

      // If not including superseded, filter them out
      if (!includeSuperseded) {
        q = query(
          knowledgeRef,
          where('accountId', '==', this.accountId),
          where('tags', 'array-contains-any', tags),
          where('replaced_by', '==', null),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      console.log(`🏷️ Found ${entries.length} entries for tags: ${tags.join(', ')}`);
      return entries;
    } catch (error) {
      console.error('Error getting knowledge by tags:', error);
      return [];
    }
  }

  // Update knowledge entry - filters undefined values for Firestore compatibility
  async updateKnowledge(id: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'accountId'>>): Promise<void> {
    try {
      // Try to update vector embedding if content changed
      if (updates.content || updates.tags) {
        try {
          await callKnowledgeAPI('update', {
            id,
            updates: {
              content: updates.content,
              tags: updates.tags
            }
          });
        } catch (vectorError) {
          console.warn('Vector update failed:', vectorError);
        }
      }

      // Filter out undefined values for Firestore
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_key, value]) => value !== undefined)
      );

      // Update Firestore
      const docRef = doc(db, 'knowledge', id);
      await updateDoc(docRef, {
        ...cleanUpdates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating knowledge:', error);
      throw error;
    }
  }

  // Delete knowledge entry
  async deleteKnowledge(id: string): Promise<void> {
    try {
      // Try to delete from vector store
      try {
        await callKnowledgeAPI('delete', { id });
      } catch (vectorError) {
        console.warn('Vector deletion failed:', vectorError);
      }

      // Delete from Firestore
      await deleteDoc(doc(db, 'knowledge', id));
    } catch (error) {
      console.error('Error deleting knowledge:', error);
      throw error;
    }
  }

  // Real-time listener for knowledge updates (Firestore only for now)
  subscribeToKnowledge(callback: (entries: KnowledgeEntry[]) => void) {
    const knowledgeRef = collection(db, 'knowledge');
    const q = query(
      knowledgeRef,
      where('accountId', '==', this.accountId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];
      callback(entries);
    });
  }
}

// Account management functions
export async function createAccount(memberIds: string[]): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'accounts'), {
      members: memberIds,
      createdAt: serverTimestamp(),
      settings: {
        allowNotifications: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
}

export async function getAccountByMember(userId: string): Promise<Account | null> {
  try {
    const accountsRef = collection(db, 'accounts');
    const q = query(accountsRef, where('members', 'array-contains', userId));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    } as Account;
  } catch (error) {
    console.error('Error getting account:', error);
    return null;
  }
}

export async function joinAccount(accountId: string, userId: string): Promise<void> {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    // Note: In a real app, you'd want to check if the account exists and if the user is authorized
    await updateDoc(accountRef, {
      members: [userId], // This would need to be an array union in a real implementation
    });
  } catch (error) {
    console.error('Error joining account:', error);
    throw error;
  }
}

// Optimized utility function to get tag statistics with caching
export async function getTagStats(accountId: string): Promise<Record<string, number>> {
  const cacheKey = cacheKeys.tagStats(accountId);
  
  // Check cache first
  const cached = cache.get<Record<string, number>>(cacheKey);
  if (cached) {
    console.log('📊 Tag stats served from cache');
    return cached;
  }

  try {
    // Try efficient Supabase SQL function first
    const { data, error } = await supabase
      .rpc('get_tag_stats', { account_id_param: accountId });

    if (!error && data) {
      const stats: Record<string, number> = {};
      data.forEach((row: { tag: string; count: number }) => {
        stats[row.tag] = row.count;
      });
      
      // Cache for 10 minutes
      cache.set(cacheKey, stats, 10);
      console.log('📊 Tag stats loaded from Supabase');
      return stats;
    }
  } catch (supabaseError) {
    console.warn('Supabase tag stats failed, falling back to Firestore:', supabaseError);
  }

  // Fallback to Firestore (less efficient but reliable)
  try {
    const knowledgeService = new KnowledgeService(accountId);
    const entries = await knowledgeService.getRecentKnowledge(500); // Reduced from 1000
    
    const stats: Record<string, number> = {};
    entries.forEach(entry => {
      entry.tags.forEach(tag => {
        stats[tag] = (stats[tag] || 0) + 1;
      });
    });
    
    // Cache for 5 minutes (shorter for fallback)
    cache.set(cacheKey, stats, 5);
    console.log('📊 Tag stats calculated from Firestore');
    return stats;
  } catch (error) {
    console.error('Error getting tag stats:', error);
    return {};
  }
} 