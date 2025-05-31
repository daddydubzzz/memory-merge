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
import { cache } from '../../cache';
import { db } from '../../firebase';
import type { KnowledgeEntry } from '../types';

/**
 * Knowledge CRUD Service
 * Handles basic Create, Read, Update, Delete operations for knowledge entries
 */

// Helper function to call API routes
async function callKnowledgeAPI(action: string, data: Record<string, unknown>) {
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

export class KnowledgeCRUDService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  // Store new knowledge entry with vector embedding support
  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'> & {
    clientStorageDate?: string;
    userTimezone?: string;
  }): Promise<string> {
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
        timestamp: entryWithDefaults.timestamp,
        clientStorageDate: entryWithDefaults.clientStorageDate,
        userTimezone: entryWithDefaults.userTimezone
      });

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
        Object.entries(updates).filter(([, value]) => value !== undefined)
      );

      // Update Firestore
      const docRef = doc(db, 'knowledge', id);
      await updateDoc(docRef, {
        ...cleanUpdates,
        updatedAt: serverTimestamp(),
      });

      // Invalidate caches since we updated data (especially important for revision system)
      cache.invalidatePattern(this.accountId);
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

      // Invalidate caches
      cache.invalidatePattern(this.accountId);
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