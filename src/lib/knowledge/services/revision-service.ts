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
 * Revision Service
 * Handles memory replacement logic and revision tracking for knowledge entries
 */

export class RevisionService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  // Handle memory replacement logic - improved to handle Firestore null/undefined differences
  async handleMemoryReplacement(replaces: string, newTimestamp: string, updateKnowledgeFn: (id: string, updates: Partial<KnowledgeEntry>) => Promise<void>): Promise<void> {
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
          
          await updateKnowledgeFn(entryToReplace.id, {
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

  // Check if an entry is superseded
  isSuperseded(entry: KnowledgeEntry): boolean {
    return entry.replaced_by !== null && entry.replaced_by !== undefined && entry.replaced_by.trim() !== '';
  }

  // Get revision history for a specific tag or concept
  async getRevisionHistory(identifier: string): Promise<KnowledgeEntry[]> {
    try {
      console.log(`📋 Getting revision history for: ${identifier}`);
      
      const knowledgeRef = collection(db, 'knowledge');
      const historyEntries: KnowledgeEntry[] = [];

      // Search by tag
      const tagQuery = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains', identifier),
        orderBy('createdAt', 'asc') // Chronological order for history
      );

      const tagSnapshot = await getDocs(tagQuery);
      const tagEntries = tagSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      historyEntries.push(...tagEntries);

      // Also search by replaces field to find entries that replaced this identifier
      const replacesQuery = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('replaces', '==', identifier),
        orderBy('createdAt', 'asc')
      );

      const replacesSnapshot = await getDocs(replacesQuery);
      const replacesEntries = replacesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];

      // Merge and deduplicate
      const allEntries = [...historyEntries, ...replacesEntries];
      const uniqueEntries = allEntries.filter((entry, index, self) => 
        index === self.findIndex(e => e.id === entry.id)
      );

      // Sort by creation date
      uniqueEntries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      console.log(`📋 Found ${uniqueEntries.length} entries in revision history for: ${identifier}`);
      return uniqueEntries;
    } catch (error) {
      console.error('Error getting revision history:', error);
      return [];
    }
  }

  // Get the current (non-superseded) version of entries for a tag
  async getCurrentVersion(tag: string): Promise<KnowledgeEntry[]> {
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

      console.log(`📌 Found ${entries.length} current version entries for tag: ${tag}`);
      return entries;
    } catch (error) {
      console.error('Error getting current version:', error);
      return [];
    }
  }
} 