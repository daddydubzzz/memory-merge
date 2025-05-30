'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Heart, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  validateShareLink, 
  joinSpaceByShareLink,
  type ShareLink,
  type Space 
} from '@/lib/knowledge';

type ErrorType = 'validation' | 'network' | 'auth' | 'join' | 'unknown';

interface DetailedError {
  type: ErrorType;
  message: string;
  retryable: boolean;
  originalError?: Error;
}

// Utility functions moved outside component to avoid dependency issues
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retryWithBackoff = async <T,>(
  operation: () => Promise<T>,
  attempt: number = 0,
  maxRetries: number = 3
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (attempt >= maxRetries) {
      throw error;
    }
    
    const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    console.log(`Retrying operation in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await delay(backoffMs);
    return retryWithBackoff(operation, attempt + 1, maxRetries);
  }
};

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading, profileReady, signInWithGoogle } = useAuth();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [joining, setJoining] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [error, setError] = useState<DetailedError | null>(null);
  const [success, setSuccess] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Validating invite...');
  
  const maxRetries = 3;
  const validationAttempted = useRef(false);

  // Helper function to determine error type and create detailed error
  const createError = (error: unknown, context: string): DetailedError => {
    console.error(`Error in ${context}:`, error);
    
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
        return {
          type: 'network',
          message: 'Network connection issue. Please check your internet connection.',
          retryable: true,
          originalError: error
        };
      }
      
      if (message.includes('auth') || message.includes('permission') || message.includes('unauthorized')) {
        return {
          type: 'auth',
          message: 'Authentication issue. Please try signing in again.',
          retryable: true,
          originalError: error
        };
      }
      
      if (message.includes('not found') || message.includes('invalid') || message.includes('expired')) {
        return {
          type: 'validation',
          message: error.message,
          retryable: false,
          originalError: error
        };
      }
      
      return {
        type: 'unknown',
        message: error.message || 'An unexpected error occurred.',
        retryable: true,
        originalError: error
      };
    }
    
    return {
      type: 'unknown',
      message: 'An unexpected error occurred. Please try again.',
      retryable: true
    };
  };

  // Validate the share link with retry logic
  const validateToken = useCallback(async (attemptNumber: number = 0) => {
    if (!token) return;
    
    setValidating(true);
    setRetryAttempt(attemptNumber);
    setLoadingMessage(
      attemptNumber === 0 
        ? 'Validating invite...' 
        : `Retrying validation... (${attemptNumber}/${maxRetries})`
    );
    
    try {
      const validation = await retryWithBackoff(async () => {
        console.log(`🔄 Validating share link: ${token} (attempt ${attemptNumber + 1})`);
        return await validateShareLink(token);
      }, attemptNumber, maxRetries);
      
      if (validation.valid && validation.shareLink && validation.space) {
        console.log('✅ Share link validation successful');
        setShareLink(validation.shareLink);
        setSpace(validation.space);
        setError(null);
        setLoadingMessage('Invite validated successfully!');
      } else {
        const errorMsg = validation.error || 'Invalid share link';
        console.log('❌ Share link validation failed:', errorMsg);
        setError(createError(new Error(errorMsg), 'validation'));
      }
    } catch (error) {
      console.error('❌ Share link validation error:', error);
      setError(createError(error, 'validation'));
    } finally {
      setValidating(false);
      setLoading(false);
    }
  }, [token, maxRetries]);

  // Initial validation effect
  useEffect(() => {
    if (token && !validationAttempted.current) {
      validationAttempted.current = true;
      validateToken(0);
    }
  }, [token, validateToken]);

  const handleJoinSpace = useCallback(async () => {
    if (!user || !token) {
      console.log('❌ Cannot join space: missing user or token');
      return;
    }

    console.log('🔄 Attempting to join space...');
    setJoining(true);
    setLoadingMessage('Joining space...');
    
    try {
      const result = await retryWithBackoff(async () => {
        return await joinSpaceByShareLink(token, user.uid);
      }, 0, maxRetries);
      
      if (result.success) {
        console.log('✅ Successfully joined space');
        setSuccess(true);
        setLoadingMessage('Welcome! Redirecting...');
        // Redirect to the space after a short delay
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        console.log('❌ Failed to join space:', result.error);
        setError(createError(new Error(result.error || 'Failed to join space'), 'join'));
      }
    } catch (error) {
      console.error('❌ Error joining space:', error);
      setError(createError(error, 'join'));
    } finally {
      setJoining(false);
    }
  }, [user, token, router, maxRetries]);

  // Handle joining after user authenticates and profile is ready
  useEffect(() => {
    if (user && profileReady && shareLink && space && !success && !joining && !authLoading) {
      console.log('🔄 User authenticated and profile ready, joining space...');
      handleJoinSpace();
    }
  }, [user, profileReady, shareLink, space, success, joining, authLoading, handleJoinSpace]);

  const handleSignIn = async () => {
    setLoadingMessage('Signing in...');
    try {
      await signInWithGoogle();
      // The useEffect will handle joining after authentication
    } catch (error) {
      console.error('Error signing in:', error);
      setError(createError(error, 'auth'));
    }
  };

  const handleRetry = () => {
    setError(null);
    setRetryAttempt(0);
    if (!shareLink || !space) {
      // Retry validation
      validateToken(0);
    } else if (user && !success) {
      // Retry joining
      handleJoinSpace();
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

  // Show loading state
  if (loading || validating || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{loadingMessage}</h2>
          <p className="text-gray-600">Please wait while we process your invitation</p>
          {retryAttempt > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              This may take a moment for new accounts...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show error state with retry option
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            {error.type === 'validation' ? 'Invalid Invitation' : 'Connection Issue'}
          </h1>
          <p className="text-gray-600 mb-6">{error.message}</p>
          
          <div className="space-y-3">
            {error.retryable && (
              <button
                onClick={handleRetry}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </button>
            )}
            <button
              onClick={() => router.push('/')}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all duration-200"
            >
              Go to Home
            </button>
          </div>
          
          {error.type === 'network' && (
            <p className="text-xs text-gray-500 mt-4">
              If the problem persists, please check your internet connection and try again.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show success state
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

  // Validation failed but no specific error (edge case)
  if (!space || !shareLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Something Went Wrong</h1>
          <p className="text-gray-600 mb-6">
            We couldn&apos;t process your invitation. This might be a temporary issue.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all duration-200"
            >
              Go to Home
            </button>
          </div>
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
                <p className="text-gray-600">{loadingMessage}</p>
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