import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Account } from '../types';

/**
 * Account management service
 * Handles basic account operations like creation, lookup, and member management
 */

// Create a new account with initial members
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

// Get account by member user ID
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

// Join an existing account
export async function joinAccount(accountId: string, userId: string): Promise<void> {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    
    // Check if the account exists
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) {
      throw new Error('Account not found. Please check the invite code.');
    }
    
    const accountData = accountSnap.data();
    
    // Check if user is already a member
    if (accountData.members?.includes(userId)) {
      throw new Error('You are already a member of this account.');
    }
    
    // Add user to the account
    await updateDoc(accountRef, {
      members: arrayUnion(userId),
    });
  } catch (error) {
    console.error('Error joining account:', error);
    throw error;
  }
} 