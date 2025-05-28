'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { getCoupleByMember } from '@/lib/knowledge';
import AuthForm from '@/components/AuthForm';
import Dashboard from '@/components/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [coupleLoading, setCoupleLoading] = useState(true);

  // Check if user has a couple when they sign in
  useEffect(() => {
    const checkCouple = async () => {
      if (user) {
        setCoupleLoading(true);
        try {
          const couple = await getCoupleByMember(user.uid);
          setCoupleId(couple?.id || null);
        } catch (error) {
          console.error('Error checking couple:', error);
        }
        setCoupleLoading(false);
      } else {
        setCoupleId(null);
        setCoupleLoading(false);
      }
    };

    checkCouple();
  }, [user]);

  // Show loading spinner while checking auth or couple status
  if (loading || coupleLoading) {
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
      coupleId={coupleId} 
      onCoupleSetup={(newCoupleId) => setCoupleId(newCoupleId)} 
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
