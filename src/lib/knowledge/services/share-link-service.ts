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
  getDoc,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { ShareLink, Space } from '../types';
import { getSpaceById, addSpaceToUserProfile } from './space-service';

/**
 * Share link management service
 * Handles space invitation links with expiration, usage limits, and permissions
 */

// Generate a unique 9-character token for share links
function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create a new share link for a space
export async function createShareLink(
  spaceId: string, 
  userId: string, 
  options: {
    expiresInDays?: number;
    maxUses?: number;
    customMessage?: string;
  } = {}
): Promise<{ shareUrl: string; token: string; shareLink: ShareLink }> {
  try {
    // Verify user has permission to create share links for this space
    const space = await getSpaceById(spaceId);
    if (!space) {
      throw new Error('Space not found');
    }
    
    if (space.owner !== userId && !space.members.includes(userId)) {
      throw new Error('Permission denied: Not a member of this space');
    }

    // Generate unique token
    let token = generateShareToken();
    
    // Ensure token is unique
    let attempts = 0;
    while (attempts < 5) {
      const existingLink = await getShareLinkByToken(token);
      if (!existingLink) break;
      token = generateShareToken();
      attempts++;
    }
    
    if (attempts >= 5) {
      throw new Error('Failed to generate unique token');
    }

    // Calculate expiration if specified
    let expiresAt: Date | undefined;
    if (options.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }

    // Create share link object
    const shareLink: Omit<ShareLink, 'id'> = {
      spaceId,
      token,
      createdBy: userId,
      createdAt: new Date(),
      expiresAt,
      usageCount: 0,
      maxUses: options.maxUses,
      isActive: true,
      customMessage: options.customMessage,
    };

    // Filter out undefined values for Firestore compatibility
    const cleanShareLink = Object.fromEntries(
      Object.entries({
        ...shareLink,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt || null,
      }).filter(([, value]) => value !== undefined)
    );

    // Store in Firestore
    const shareLinkRef = await addDoc(collection(db, 'shareLinks'), cleanShareLink);

    const finalShareLink = { ...shareLink, id: shareLinkRef.id };
    
    // Generate share URL
    const getBaseUrl = () => {
      // In browser environment, we can use window.location
      if (typeof window !== 'undefined') {
        return `${window.location.protocol}//${window.location.host}`;
      }
      
      // In server environment, check environment variables
      const envUrl = process.env.NEXT_PUBLIC_BASE_URL;
      if (envUrl) {
        return envUrl;
      }
      
      // Check Vercel environment
      const vercelUrl = process.env.VERCEL_URL;
      if (vercelUrl) {
        return `https://${vercelUrl}`;
      }
      
      // Default fallback for development
      return 'http://localhost:3000';
    };
    
    const baseUrl = getBaseUrl();
    const shareUrl = `${baseUrl}/join/${token}`;

    console.log('✅ Share link created:', { token, shareUrl, spaceId });
    
    return { shareUrl, token, shareLink: finalShareLink };
  } catch (error) {
    console.error('Error creating share link:', error);
    throw error;
  }
}

// Get share link by token
export async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  try {
    const shareLinksRef = collection(db, 'shareLinks');
    const q = query(shareLinksRef, where('token', '==', token), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      expiresAt: doc.data().expiresAt?.toDate(),
    } as ShareLink;
  } catch (error) {
    console.error('Error getting share link by token:', error);
    return null;
  }
}

// Validate if a share link is usable
export async function validateShareLink(token: string): Promise<{
  valid: boolean;
  shareLink?: ShareLink;
  space?: Space;
  error?: string;
}> {
  const startTime = Date.now();
  console.log(`🔄 Starting validation for token: ${token}`);
  
  try {
    console.log(`🔍 Looking up share link by token...`);
    const shareLink = await getShareLinkByToken(token);
    
    if (!shareLink) {
      console.log(`❌ Share link not found for token: ${token}`);
      return { valid: false, error: 'Share link not found' };
    }
    
    console.log(`✅ Share link found:`, {
      id: shareLink.id,
      spaceId: shareLink.spaceId,
      isActive: shareLink.isActive,
      usageCount: shareLink.usageCount,
      maxUses: shareLink.maxUses,
      expiresAt: shareLink.expiresAt
    });

    if (!shareLink.isActive) {
      console.log(`❌ Share link is deactivated: ${token}`);
      return { valid: false, error: 'Share link has been deactivated' };
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      console.log(`❌ Share link has expired: ${token}, expired at: ${shareLink.expiresAt}`);
      return { valid: false, error: 'Share link has expired' };
    }

    if (shareLink.maxUses && shareLink.usageCount >= shareLink.maxUses) {
      console.log(`❌ Share link usage limit reached: ${token}, used ${shareLink.usageCount}/${shareLink.maxUses}`);
      return { valid: false, error: 'Share link usage limit reached' };
    }

    // Get the space details
    console.log(`🔍 Getting space details for spaceId: ${shareLink.spaceId}`);
    const space = await getSpaceById(shareLink.spaceId);
    
    if (!space) {
      console.log(`❌ Associated space not found for spaceId: ${shareLink.spaceId}`);
      return { valid: false, error: 'Associated space not found' };
    }
    
    console.log(`✅ Space found:`, {
      id: space.id,
      name: space.name,
      memberCount: space.members.length
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Validation successful for token: ${token} (took ${duration}ms)`);
    return { valid: true, shareLink, space };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error validating share link: ${token} (took ${duration}ms)`, error);
    
    // Provide more specific error messages based on the error type
    let errorMessage = 'Validation failed';
    if (error instanceof Error) {
      if (error.message.includes('offline') || error.message.includes('network')) {
        errorMessage = 'Network connection issue. Please check your internet connection.';
      } else if (error.message.includes('permission') || error.message.includes('auth')) {
        errorMessage = 'Authentication issue. Please try signing in again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return { valid: false, error: errorMessage };
  }
}

// Join a space using a share link
export async function joinSpaceByShareLink(token: string, userId: string): Promise<{
  success: boolean;
  spaceId?: string;
  spaceName?: string;
  error?: string;
}> {
  const startTime = Date.now();
  console.log(`🔄 Starting join process for token: ${token}, userId: ${userId}`);
  
  try {
    // Validate the share link
    console.log(`🔍 Validating share link before joining...`);
    const validation = await validateShareLink(token);
    
    if (!validation.valid || !validation.shareLink || !validation.space) {
      console.log(`❌ Share link validation failed:`, validation.error);
      return { success: false, error: validation.error || 'Invalid share link' };
    }

    const { shareLink, space } = validation;
    console.log(`✅ Share link validated, proceeding with join process`);

    // Check if user is already a member
    if (space.members.includes(userId)) {
      console.log(`ℹ️ User ${userId} is already a member of space ${space.id}`);
      return { 
        success: true, 
        spaceId: space.id!, 
        spaceName: space.name,
        error: 'Already a member of this space'
      };
    }

    console.log(`🔄 Adding user ${userId} to space ${space.id}`);
    // Add user to space
    const spaceRef = doc(db, 'spaces', space.id!);
    await updateDoc(spaceRef, {
      members: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ User added to space members`);

    // Update user's profile
    console.log(`🔄 Adding space to user profile...`);
    await addSpaceToUserProfile(userId, space.id!);
    console.log(`✅ Space added to user profile`);

    // Increment usage count
    console.log(`🔄 Incrementing share link usage count...`);
    const shareLinkRef = doc(db, 'shareLinks', shareLink.id!);
    await updateDoc(shareLinkRef, {
      usageCount: shareLink.usageCount + 1,
    });
    console.log(`✅ Usage count incremented to ${shareLink.usageCount + 1}`);

    const duration = Date.now() - startTime;
    console.log(`✅ User joined space successfully via share link (took ${duration}ms):`, { 
      userId, 
      spaceId: space.id, 
      spaceName: space.name,
      token 
    });

    return { 
      success: true, 
      spaceId: space.id!, 
      spaceName: space.name 
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error joining space by share link (took ${duration}ms):`, error);
    
    // Provide more specific error messages based on the error type
    let errorMessage = 'Failed to join space';
    if (error instanceof Error) {
      if (error.message.includes('offline') || error.message.includes('network')) {
        errorMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.message.includes('permission') || error.message.includes('auth')) {
        errorMessage = 'Authentication issue. Please ensure you are signed in and try again.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'Space or share link no longer exists.';
      } else {
        errorMessage = `Failed to join space: ${error.message}`;
      }
    }
    
    return { success: false, error: errorMessage };
  }
}

// Get all share links for a space
export async function getSpaceShareLinks(spaceId: string, userId: string): Promise<ShareLink[]> {
  try {
    // Verify user has permission to view share links
    const space = await getSpaceById(spaceId);
    if (!space || (space.owner !== userId && !space.members.includes(userId))) {
      throw new Error('Permission denied');
    }

    const shareLinksRef = collection(db, 'shareLinks');
    const q = query(
      shareLinksRef, 
      where('spaceId', '==', spaceId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      expiresAt: doc.data().expiresAt?.toDate(),
    })) as ShareLink[];
  } catch (error) {
    console.error('Error getting space share links:', error);
    return [];
  }
}

// Deactivate a share link
export async function deactivateShareLink(shareLinkId: string, userId: string): Promise<boolean> {
  try {
    // Get the share link to verify permissions
    const shareLinkDoc = await getDoc(doc(db, 'shareLinks', shareLinkId));
    if (!shareLinkDoc.exists()) {
      throw new Error('Share link not found');
    }

    const shareLink = shareLinkDoc.data() as ShareLink;
    
    // Verify user has permission (creator or space owner)
    const space = await getSpaceById(shareLink.spaceId);
    if (!space || (shareLink.createdBy !== userId && space.owner !== userId)) {
      throw new Error('Permission denied');
    }

    // Deactivate the link
    await updateDoc(doc(db, 'shareLinks', shareLinkId), {
      isActive: false,
    });

    return true;
  } catch (error) {
    console.error('Error deactivating share link:', error);
    return false;
  }
} 