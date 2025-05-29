import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  setDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Space, UserProfile } from '../types';

/**
 * Space management service
 * Handles personal and shared space operations, user profiles, and space memberships
 */

// Create a personal space for a user (called during signup)
export async function createPersonalSpace(userId: string, userDisplayName?: string, userEmail?: string): Promise<string> {
  try {
    console.log('🏗️ createPersonalSpace called for user:', userId);
    
    // First check if user already has a personal space (double-check)
    const existingProfile = await getUserProfile(userId);
    if (existingProfile) {
      console.log('⚠️ User already has a profile with personal space:', existingProfile.personalSpaceId);
      return existingProfile.personalSpaceId;
    }

    // Check if user already has any personal spaces (direct space query)
    const userSpaces = await getUserSpaces(userId);
    const existingPersonalSpace = userSpaces.find(space => space.type === 'personal');
    if (existingPersonalSpace) {
      console.log('⚠️ User already has a personal space:', existingPersonalSpace.id);
      // Create profile pointing to existing space
      await createOrUpdateUserProfile(userId, existingPersonalSpace.id!, userDisplayName, userEmail);
      return existingPersonalSpace.id!;
    }

    console.log('🏗️ Creating new personal space for user:', userId);
    const personalSpace: Omit<Space, 'id'> = {
      name: 'My Personal Space',
      type: 'personal',
      owner: userId,
      members: [userId],
      icon: '🧠',
      color: 'blue',
      settings: {
        allowNotifications: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isPublic: false,
        allowMemberInvites: false, // Personal spaces don't allow invites
      },
      createdAt: new Date(),
    };

    const spaceRef = await addDoc(collection(db, 'spaces'), {
      ...personalSpace,
      createdAt: serverTimestamp(),
    });

    console.log('✅ Personal space created with ID:', spaceRef.id);

    // Create or update user profile - with retry logic in case of race conditions
    let profileCreated = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!profileCreated && attempts < maxAttempts) {
      try {
        await createOrUpdateUserProfile(userId, spaceRef.id, userDisplayName, userEmail);
        profileCreated = true;
        console.log('✅ User profile created/updated successfully');
      } catch (profileError) {
        attempts++;
        console.warn(`⚠️ Profile creation attempt ${attempts} failed:`, profileError);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        } else {
          throw profileError;
        }
      }
    }

    return spaceRef.id;
  } catch (error) {
    console.error('❌ Error creating personal space:', error);
    throw error;
  }
}

// Create a shared space
export async function createSharedSpace(
  userId: string, 
  name: string, 
  icon: string = '👥',
  color: string = 'purple'
): Promise<string> {
  try {
    const sharedSpace: Omit<Space, 'id'> = {
      name,
      type: 'shared',
      owner: userId,
      members: [userId],
      icon,
      color,
      settings: {
        allowNotifications: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isPublic: false,
        allowMemberInvites: true,
      },
      createdAt: new Date(),
    };

    const spaceRef = await addDoc(collection(db, 'spaces'), {
      ...sharedSpace,
      createdAt: serverTimestamp(),
    });

    // Update user profile to include this space
    await addSpaceToUserProfile(userId, spaceRef.id);

    return spaceRef.id;
  } catch (error) {
    console.error('Error creating shared space:', error);
    throw error;
  }
}

// Create or update user profile
export async function createOrUpdateUserProfile(
  userId: string, 
  personalSpaceId: string, 
  displayName?: string, 
  email?: string
): Promise<void> {
  try {
    const userRef = doc(db, 'userProfiles', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      // Update existing profile
      await updateDoc(userRef, {
        personalSpaceId,
        activeSpaceId: personalSpaceId,
        spaceMemberships: arrayUnion(personalSpaceId),
        ...(displayName && { displayName }),
        ...(email && { email }),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create new profile using userId as document ID
      const userProfile = {
        uid: userId,
        personalSpaceId,
        activeSpaceId: personalSpaceId,
        spaceMemberships: [personalSpaceId],
        displayName,
        email,
        createdAt: serverTimestamp(),
      };
      
      await setDoc(userRef, userProfile);
    }
  } catch (error) {
    console.error('Error creating/updating user profile:', error);
    throw error;
  }
}

// Add space to user's memberships
export async function addSpaceToUserProfile(userId: string, spaceId: string): Promise<void> {
  try {
    const userRef = doc(db, 'userProfiles', userId);
    await updateDoc(userRef, {
      spaceMemberships: arrayUnion(spaceId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error adding space to user profile:', error);
    throw error;
  }
}

// Get user's spaces
export async function getUserSpaces(userId: string): Promise<Space[]> {
  try {
    const spacesRef = collection(db, 'spaces');
    const q = query(spacesRef, where('members', 'array-contains', userId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as Space[];
  } catch (error) {
    console.error('Error getting user spaces:', error);
    return [];
  }
}

// Get user profile
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'userProfiles', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return null;
    }

    return {
      ...userSnap.data(),
      createdAt: userSnap.data().createdAt?.toDate() || new Date(),
      updatedAt: userSnap.data().updatedAt?.toDate(),
    } as UserProfile;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

// Update user's active space
export async function updateActiveSpace(userId: string, spaceId: string): Promise<void> {
  try {
    const userRef = doc(db, 'userProfiles', userId);
    await updateDoc(userRef, {
      activeSpaceId: spaceId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating active space:', error);
    throw error;
  }
}

// Get space by ID
export async function getSpaceById(spaceId: string): Promise<Space | null> {
  try {
    const spaceDoc = await getDoc(doc(db, 'spaces', spaceId));
    if (!spaceDoc.exists()) {
      return null;
    }

    return {
      id: spaceDoc.id,
      ...spaceDoc.data(),
      createdAt: spaceDoc.data().createdAt?.toDate() || new Date(),
      updatedAt: spaceDoc.data().updatedAt?.toDate(),
    } as Space;
  } catch (error) {
    console.error('Error getting space:', error);
    return null;
  }
}

// Helper function to clean up duplicate personal spaces (for users who already experienced the bug)
export async function cleanupDuplicatePersonalSpaces(userId: string): Promise<void> {
  try {
    console.log('🧹 Cleaning up duplicate personal spaces for user:', userId);
    
    // Get all user's spaces
    const userSpaces = await getUserSpaces(userId);
    const personalSpaces = userSpaces.filter(space => space.type === 'personal');
    
    if (personalSpaces.length <= 1) {
      console.log('✅ No duplicate personal spaces found');
      return;
    }
    
    console.log(`⚠️ Found ${personalSpaces.length} personal spaces, keeping the first one`);
    
    // Keep the first personal space (usually the oldest)
    const keepSpace = personalSpaces[0];
    const duplicateSpaces = personalSpaces.slice(1);
    
    // Update user profile to point to the kept space
    await createOrUpdateUserProfile(userId, keepSpace.id!, undefined, undefined);
    
    // Delete duplicate spaces
    for (const duplicateSpace of duplicateSpaces) {
      if (duplicateSpace.id) {
        console.log(`🗑️ Deleting duplicate personal space: ${duplicateSpace.id}`);
        await deleteDoc(doc(db, 'spaces', duplicateSpace.id));
      }
    }
    
    console.log(`✅ Cleaned up ${duplicateSpaces.length} duplicate personal spaces`);
  } catch (error) {
    console.error('❌ Error cleaning up duplicate personal spaces:', error);
    // Don't throw - this is a cleanup operation and shouldn't break the app
  }
} 