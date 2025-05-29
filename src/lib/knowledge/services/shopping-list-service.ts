import { 
  collection, 
  query, 
  where, 
  orderBy,
  getDocs
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { KnowledgeEntry } from '../types';

/**
 * Shopping List Service
 * Handles all shopping list specific functionality including active lists, purchases, and clearing
 */

export class ShoppingListService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
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
  async handleItemPurchase(
    purchasedItems: string[], 
    tags: string[], 
    addKnowledgeFn: (entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>) => Promise<string>,
    updateKnowledgeFn: (id: string, updates: Partial<KnowledgeEntry>) => Promise<void>
  ): Promise<void> {
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
          await updateKnowledgeFn(entry.id, {
            replaced_by: timestamp
          });
          console.log(`✅ Marked original entry as superseded: ${entry.id}`);

          // If there are remaining items, create a new entry for them
          if (remainingItems.length > 0) {
            const remainingContent = `Need ${remainingItems.join(', ')} from the store`;
            
            await addKnowledgeFn({
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
      await addKnowledgeFn({
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
  async clearShoppingList(
    listType: string, 
    addKnowledgeFn: (entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>) => Promise<string>,
    updateKnowledgeFn: (id: string, updates: Partial<KnowledgeEntry>) => Promise<void>
  ): Promise<void> {
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
          await updateKnowledgeFn(entry.id, {
            replaced_by: timestamp
          });
          console.log(`✅ Cleared list item: ${entry.content.substring(0, 50)}...`);
        }
      }

      // Store the clear list record
      await addKnowledgeFn({
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
} 