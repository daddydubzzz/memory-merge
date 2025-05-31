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
  // Guard clause to handle undefined/null userId
  if (!userId || typeof userId !== 'string') {
    console.warn(`⚠️ getUserDisplayName called with invalid userId: ${userId}`);
    return 'Unknown User';
  }
  
  console.log(`🔍 Looking up user: "${userId}" (length: ${userId.length})`);
  
  try {
    // First try the users collection (legacy/primary location)
    console.log('🔍 Checking users collection...');
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      console.log('✅ Found user in users collection:', {
        hasDisplayName: !!userData.displayName,
        hasEmail: !!userData.email,
        displayName: userData.displayName,
        email: userData.email
      });
      
      const displayName = userData.displayName || userData.email?.split('@')[0];
      if (displayName) {
        console.log(`✅ Returning displayName from users: "${displayName}"`);
        return displayName;
      }
    } else {
      console.log('❌ User not found in users collection');
    }
    
    // Fallback to userProfiles collection
    console.log('🔍 Checking userProfiles collection...');
    const profileRef = doc(db, 'userProfiles', userId);
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      const profileData = profileSnap.data();
      console.log('✅ Found user in userProfiles collection:', {
        hasDisplayName: !!profileData.displayName,
        hasEmail: !!profileData.email,
        displayName: profileData.displayName,
        email: profileData.email
      });
      
      const displayName = profileData.displayName || profileData.email?.split('@')[0];
      if (displayName) {
        console.log(`✅ Returning displayName from userProfiles: "${displayName}"`);
        return displayName;
      }
    } else {
      console.log('❌ User not found in userProfiles collection');
    }
    
    // Final fallback - create a readable name from the user ID
    console.warn(`❌ No display name found for user ${userId}, using fallback`);
    console.log('💡 Tip: Check if the user ID is correct and the user exists in Firestore');
    return `User ${userId.substring(0, 8)}`;
    
  } catch (error) {
    console.error('💥 Error fetching user:', error);
    return `User ${userId.substring(0, 8)}`;
  }
} 