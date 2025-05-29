'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Heart, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  validateShareLink, 
  joinSpaceByShareLink,
  type ShareLink,
  type Space 
} from '@/lib/knowledge';

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validate the share link on load
  useEffect(() => {
    const validateToken = async () => {
      setLoading(true);
      try {
        const validation = await validateShareLink(token);
        
        if (validation.valid && validation.shareLink && validation.space) {
          setShareLink(validation.shareLink);
          setSpace(validation.space);
        } else {
          setError(validation.error || 'Invalid share link');
        }
      } catch (error) {
        console.error('Error validating share link:', error);
        setError('Failed to validate share link');
      }
      setLoading(false);
    };

    if (token) {
      validateToken();
    }
  }, [token]);

  const handleJoinSpace = useCallback(async () => {
    if (!user || !token) return;

    setJoining(true);
    try {
      const result = await joinSpaceByShareLink(token, user.uid);
      
      if (result.success) {
        setSuccess(true);
        // Redirect to the space after a short delay
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setError(result.error || 'Failed to join space');
      }
    } catch (error) {
      console.error('Error joining space:', error);
      setError('Failed to join space. Please try again.');
    }
    setJoining(false);
  }, [user, token, router]);

  // Handle joining after user authenticates
  useEffect(() => {
    if (user && shareLink && space && !success && !joining) {
      handleJoinSpace();
    }
  }, [user, shareLink, space, success, joining, handleJoinSpace]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
      // The useEffect will handle joining after authentication
    } catch (error) {
      console.error('Error signing in:', error);
      setError('Failed to sign in. Please try again.');
    }
  };

  const getSpaceColor = (space: Space) => {
    const colors = {
      blue: 'from-blue-500 to-blue-600',
      purple: 'from-purple-500 to-purple-600',
      green: 'from-green-500 to-green-600',
      orange: 'from-orange-500 to-orange-600',
      pink: 'from-pink-500 to-pink-600',
      red: 'from-red-500 to-red-600',
    };
    return colors[space.color as keyof typeof colors] || colors.blue;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Validating invite...</h2>
          <p className="text-gray-600">Please wait while we check your invitation</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Welcome to {space?.name}! 🎉</h1>
          <p className="text-gray-600 mb-6">
            You&apos;ve successfully joined the space. Redirecting you now...
          </p>
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!space || !shareLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Something went wrong. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-200/15 to-orange-200/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative flex items-center justify-center min-h-screen p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-2xl w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/25 mx-auto mb-6">
              <Heart className="w-8 h-8 text-white" fill="currentColor" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-purple-900 to-pink-900 bg-clip-text text-transparent mb-2">
              You&apos;re Invited!
            </h1>
            <p className="text-gray-600 text-lg">
              Join a shared knowledge space
            </p>
          </div>

          {/* Space Preview */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-2xl p-6 mb-8 border border-gray-200/50">
            <div className="flex items-center space-x-4 mb-4">
              <div className={`w-16 h-16 bg-gradient-to-r ${getSpaceColor(space)} rounded-xl flex items-center justify-center text-white text-2xl shadow-lg`}>
                {space.icon || '👥'}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800">{space.name}</h2>
                <p className="text-gray-600 flex items-center mt-1">
                  <Users className="w-4 h-4 mr-2" />
                  {space.members.length} member{space.members.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {shareLink.customMessage && (
              <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-200/30">
                <p className="text-blue-800 italic">&quot;{shareLink.customMessage}&quot;</p>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="text-center">
            {!user ? (
              <div>
                <p className="text-gray-600 mb-6">
                  Sign in to join this space and start collaborating
                </p>
                <button
                  onClick={handleSignIn}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg shadow-blue-500/25 flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
                <p className="text-xs text-gray-500 mt-3">
                  New to Memory Merge? We&apos;ll create your account automatically
                </p>
              </div>
            ) : joining ? (
              <div>
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Joining space...</p>
              </div>
            ) : (
              <button
                onClick={handleJoinSpace}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-green-700 hover:to-emerald-700 transition-all duration-200 shadow-lg shadow-green-500/25"
              >
                Join Space
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-8 pt-6 border-t border-gray-200/50">
            <p className="text-xs text-gray-500">
              By joining, you&apos;ll get access to shared knowledge and conversations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 