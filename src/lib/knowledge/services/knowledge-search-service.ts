import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs
} from 'firebase/firestore';
import { cache, cacheKeys } from '../../cache';
import { db } from '../../firebase';
import type { KnowledgeEntry } from '../types';

/**
 * Knowledge Search Service
 * Handles search operations, vector similarity, caching, and filtering
 */

// Synonym mapping for better search recall
const SYNONYM_GROUPS = {
  // Anatomical terms (male)
  testicles: ['testicle', 'testicles', 'balls', 'ball', 'nuts', 'nut', 'nads', 'family jewels', 'boys', 'sack', 'ballsack', 'nutsack', 'scrotum', 'gonads'],
  
  // Anatomical terms (general)
  penis: ['penis', 'dick', 'cock', 'member', 'shaft', 'junk', 'package', 'manhood'],
  breasts: ['breasts', 'breast', 'boobs', 'tits', 'chest', 'bust'],
  
  // Medical/body terms
  buttocks: ['butt', 'ass', 'rear', 'behind', 'bottom', 'buttocks', 'glutes'],
  
  // Common slang expansions
  money: ['money', 'cash', 'dough', 'bucks', 'dollars'],
  car: ['car', 'vehicle', 'ride', 'wheels', 'auto'],
  house: ['house', 'home', 'place', 'pad', 'crib'],
  
  // Add more groups as needed
};

/**
 * Expand search terms with synonyms for better recall
 */
function expandSearchTermsWithSynonyms(searchTerms: string[]): string[] {
  const expandedTerms = new Set(searchTerms);
  
  for (const term of searchTerms) {
    const lowerTerm = term.toLowerCase();
    
    // Find which synonym group this term belongs to
    for (const synonyms of Object.values(SYNONYM_GROUPS)) {
      if (synonyms.includes(lowerTerm)) {
        // Add all synonyms from this group
        synonyms.forEach(synonym => expandedTerms.add(synonym));
        console.log(`🔍 Expanded "${term}" with synonyms:`, synonyms.slice(0, 5));
        break;
      }
    }
  }
  
  return Array.from(expandedTerms);
}

// Helper function to call search API routes
async function callSearchAPI(action: string, data: Record<string, unknown>) {
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

export class KnowledgeSearchService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  // Enhanced search using vector similarity with tag-based filtering, caching, and revision support
  async searchKnowledge(searchTerms: string[], tags?: string[], includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    // Expand search terms with synonyms for better recall
    const expandedSearchTerms = expandSearchTermsWithSynonyms(searchTerms);
    
    const searchQuery = expandedSearchTerms.join(' ');
    const cacheKey = cacheKeys.searchResults(this.accountId, searchQuery, tags);
    
    console.log(`🔍 Original search terms: [${searchTerms.join(', ')}]`);
    if (expandedSearchTerms.length > searchTerms.length) {
      console.log(`🔍 Expanded search terms: [${expandedSearchTerms.join(', ')}]`);
    }
    
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
            matchThreshold: 0.3, // Lower threshold for expanded terms
            matchCount: 30, // More results to account for expansion
            minResults: 3
          }
        });

        const entries: KnowledgeEntry[] = result.results.map((item: Record<string, unknown>) => ({
          id: item.id as string,
          content: item.content as string,
          enhanced_content: item.enhanced_content as string | undefined,
          tags: (item.tags as string[]) || [],
          addedBy: item.addedBy as string,
          addedByName: item.addedByName as string | undefined,
          createdAt: new Date(item.createdAt as string),
          updatedAt: new Date(item.updatedAt as string),
          accountId: this.accountId,
          // Map revision fields if they exist - properly handle potential undefined values
          timestamp: item.timestamp as string | undefined,
          replaces: item.replaces as string | undefined,
          replaced_by: item.replaced_by as string | undefined,
          intent: item.intent as string | undefined
        }));

        // If we have good vector results, cache and return them
        if (entries.length > 0) {
          cache.set(cacheKey, entries, 2); // 2 minute cache
          console.log(`🔍 Vector search found ${entries.length} results with expanded terms`);
          return this.filterSupersededEntries(entries, includeSuperseded);
        }
      } catch (vectorError) {
        console.warn('Vector search failed, falling back to Firestore:', vectorError);
      }

      // Fallback to original Firestore search with tag filtering and expanded terms
      const results = await this.searchKnowledgeFirestore(expandedSearchTerms, tags, includeSuperseded);
      
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

        const entries: KnowledgeEntry[] = result.results.map((item: Record<string, unknown>) => ({
          id: item.id as string,
          content: item.content as string,
          enhanced_content: item.enhanced_content as string | undefined,
          tags: (item.tags as string[]) || [],
          addedBy: item.addedBy as string,
          addedByName: item.addedByName as string | undefined,
          createdAt: new Date(item.createdAt as string),
          updatedAt: new Date(item.updatedAt as string),
          accountId: this.accountId,
          // Map revision fields if they exist - properly handle potential undefined values
          timestamp: item.timestamp as string | undefined,
          replaces: item.replaces as string | undefined,
          replaced_by: item.replaced_by as string | undefined,
          intent: item.intent as string | undefined
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
} 