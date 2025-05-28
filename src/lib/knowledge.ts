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
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { KnowledgeEntry } from './constants';

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

  // Store new knowledge entry with vector embedding
  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>): Promise<string> {
    try {
      // Try to store with vector embedding first via API
      try {
        const result = await callKnowledgeAPI('store', {
          accountId: this.accountId,
          entry
        });
        
        console.log('Stored with vector embedding:', result.id);
        
        // Also store in Firestore for backup/compatibility
        await this.addKnowledgeFirestore(entry);
        
        return result.id;
      } catch (vectorError) {
        console.warn('Vector storage failed, using Firestore only:', vectorError);
        // Fallback to Firestore only
        return await this.addKnowledgeFirestore(entry);
      }
    } catch (error) {
      console.error('Error adding knowledge:', error);
      throw error;
    }
  }

  // Original Firestore storage method (kept as fallback)
  private async addKnowledgeFirestore(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'knowledge'), {
      ...entry,
      accountId: this.accountId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  // Enhanced search using vector similarity with tag-based filtering
  async searchKnowledge(searchTerms: string[], tags?: string[]): Promise<KnowledgeEntry[]> {
    try {
      const searchQuery = searchTerms.join(' ');
      
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
          accountId: this.accountId
        }));

        // If we have good vector results, return them
        if (knowledgeEntries.length > 0) {
          console.log(`🔍 Vector search found ${knowledgeEntries.length} results`);
          return knowledgeEntries;
        }
      } catch (vectorError) {
        console.warn('Vector search failed, falling back to Firestore:', vectorError);
      }

      // Fallback to original Firestore search with tag filtering
      return await this.searchKnowledgeFirestore(searchTerms, tags);

    } catch (error) {
      console.error('Error searching knowledge:', error);
      return [];
    }
  }

  // Updated Firestore search method with tag-based filtering
  private async searchKnowledgeFirestore(searchTerms: string[], tags?: string[]): Promise<KnowledgeEntry[]> {
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
    if (searchTerms.length > 0) {
      const filteredEntries = entries.filter(entry => {
        const searchText = `${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
        return searchTerms.some(term => 
          searchText.includes(term.toLowerCase())
        );
      });
      return filteredEntries;
    }

    return entries;
  }

  // Get recent knowledge entries
  async getRecentKnowledge(limitCount: number = 10): Promise<KnowledgeEntry[]> {
    try {
      const knowledgeRef = collection(db, 'knowledge');
      const q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];
    } catch (error) {
      console.error('Error getting recent knowledge:', error);
      return [];
    }
  }

  // Get knowledge by specific tags
  async getKnowledgeByTags(tags: string[]): Promise<KnowledgeEntry[]> {
    try {
      const knowledgeRef = collection(db, 'knowledge');
      const q = query(
        knowledgeRef,
        where('accountId', '==', this.accountId),
        where('tags', 'array-contains-any', tags),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as KnowledgeEntry[];
    } catch (error) {
      console.error('Error getting knowledge by tags:', error);
      return [];
    }
  }

  // Update knowledge entry
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

      // Update Firestore
      const docRef = doc(db, 'knowledge', id);
      await updateDoc(docRef, {
        ...updates,
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

// Utility function to get tag statistics
export async function getTagStats(accountId: string): Promise<Record<string, number>> {
  try {
    const knowledgeService = new KnowledgeService(accountId);
    const entries = await knowledgeService.getRecentKnowledge(1000); // Get all entries
    
    const stats: Record<string, number> = {};
    entries.forEach(entry => {
      entry.tags.forEach(tag => {
        stats[tag] = (stats[tag] || 0) + 1;
      });
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting tag stats:', error);
    return {};
  }
} 