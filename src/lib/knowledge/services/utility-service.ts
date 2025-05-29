import { createClient } from '@supabase/supabase-js';
import { doc, getDoc } from 'firebase/firestore';
import { cache, cacheKeys } from '../../cache';
import { db } from '../../firebase';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Utility service
 * Handles helper functions like tag statistics and user lookups
 */

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
    // Import KnowledgeService here to avoid circular dependency
    const { KnowledgeService } = await import('../../knowledge');
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

// Get user display name by user ID
export async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      return userData.displayName || userData.email?.split('@')[0] || 'Unknown User';
    } else {
      return 'Unknown User';
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    return 'Unknown User';
  }
} 