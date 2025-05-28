'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { getAccountByMember } from '@/lib/knowledge';
import AuthForm from '@/components/AuthForm';
import Dashboard from '@/components/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  // Check if user has an account when they sign in
  useEffect(() => {
    const checkAccount = async () => {
      if (user) {
        setAccountLoading(true);
        try {
          const account = await getAccountByMember(user.uid);
          setAccountId(account?.id || null);
        } catch (error) {
          console.error('Error checking account:', error);
        }
        setAccountLoading(false);
      } else {
        setAccountId(null);
        setAccountLoading(false);
      }
    };

    checkAccount();
  }, [user]);

  // Show loading spinner while checking auth or account status
  if (loading || accountLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth form if user is not signed in
  if (!user) {
    return <AuthForm />;
  }

  // Show dashboard if user is signed in
  return (
    <Dashboard 
      accountId={accountId} 
      onAccountSetup={(newAccountId) => setAccountId(newAccountId)} 
    />
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
