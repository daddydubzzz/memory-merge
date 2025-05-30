'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { createPersonalSpace, getUserProfile } from '@/lib/knowledge';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profileReady: boolean;
  signin: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  signout: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [profileSetupInProgress, setProfileSetupInProgress] = useState(false);

  // Create user profile in Firestore and ensure personal space exists
  const createUserProfile = async (user: User) => {
    try {
      console.log('🔄 Creating/updating user profile for:', user.uid);
      setProfileSetupInProgress(true);
      setProfileReady(false);
      
      // Create basic user document for backward compatibility
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0],
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
        });
        console.log('✅ Basic user document created');
      }

      // Check if user has a proper profile with personal space
      const userProfile = await getUserProfile(user.uid);
      
      if (!userProfile) {
        console.log('🏗️ No user profile found, creating personal space...');
        // Create personal space (this also creates the user profile)
        await createPersonalSpace(
          user.uid, 
          user.displayName || undefined, 
          user.email || undefined
        );
        console.log('✅ Personal space and profile created for new user');
      } else {
        console.log('✅ User profile already exists');
      }
      
      setProfileReady(true);
    } catch (error) {
      console.error('❌ Error creating user profile:', error);
      setProfileReady(false);
      throw error; // Re-throw to handle in the calling function
    } finally {
      setProfileSetupInProgress(false);
    }
  };

  const signin = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await createUserProfile(result.user);
  };

  const signup = async (email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(result.user);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await createUserProfile(result.user);
  };

  const signout = () => {
    setProfileReady(false);
    return signOut(auth);
  };

  const resetPassword = (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('🔄 Auth state changed:', user ? 'signed in' : 'signed out');
      
      setUser(user);
      
      if (user) {
        // User is signed in, but we need to ensure profile is ready
        if (!profileSetupInProgress) {
          try {
            // Check if profile already exists
            const userProfile = await getUserProfile(user.uid);
            if (userProfile) {
              console.log('✅ User profile already exists and ready');
              setProfileReady(true);
              setLoading(false);
            } else {
              // Profile doesn't exist, create it
              console.log('🏗️ Profile missing, creating...');
              await createUserProfile(user);
              setLoading(false);
            }
          } catch (error) {
            console.error('❌ Error checking user profile:', error);
            setProfileReady(false);
            setLoading(false);
          }
        }
        // If profile setup is in progress, loading will be set to false when it completes
      } else {
        // User is signed out
        setProfileReady(false);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [profileSetupInProgress]);

  // Update loading state when profile setup completes
  useEffect(() => {
    if (user && profileReady && !profileSetupInProgress) {
      setLoading(false);
    }
  }, [user, profileReady, profileSetupInProgress]);

  const value = {
    user,
    loading,
    profileReady,
    signin,
    signup,
    signout,
    signInWithGoogle,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 