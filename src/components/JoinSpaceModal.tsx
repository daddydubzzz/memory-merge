'use client';

import React, { useState } from 'react';
import { X, Users, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { joinSpaceByInviteCode } from '@/lib/knowledge';

interface JoinSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpaceJoined: (spaceId: string) => void;
}

export default function JoinSpaceModal({ isOpen, onClose, onSpaceJoined }: JoinSpaceModalProps) {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'success'>('input');

  const resetState = () => {
    setInviteCode('');
    setError('');
    setStep('input');
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleJoinSpace = async () => {
    if (!user || !inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const spaceId = await joinSpaceByInviteCode(inviteCode.trim().toUpperCase(), user.uid);
      setStep('success');
      onSpaceJoined(spaceId);
    } catch (error) {
      console.error('Error joining space:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to join space. Please check the invite code and try again.');
      }
    }

    setLoading(false);
  };

  const handleInputChange = (value: string) => {
    // Auto-format to uppercase and limit to 6 characters
    const formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setInviteCode(formatted);
    if (error) setError(''); // Clear error on input change
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-blue-900 bg-clip-text text-transparent">
              {step === 'input' ? 'Join Space' : 'Welcome! 🎉'}
            </h2>
            <p className="text-gray-600 mt-1">
              {step === 'input' 
                ? 'Enter the invite code to join an existing space'
                : 'You have successfully joined the space'
              }
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'input' && (
            <div className="space-y-6">
              {/* Invite Code Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Invite Code
                </label>
                <div className="relative group">
                  <Users className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="ABC123"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-gray-900 placeholder-gray-400 text-center text-lg font-mono font-bold"
                    autoFocus
                    maxLength={6}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Enter the 6-character code shared by a space member
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinSpace}
                  disabled={loading || !inviteCode.trim()}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Joining...
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 mr-2" />
                      Join Space
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center space-y-6">
              {/* Success Icon */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Success Message */}
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  Successfully Joined!
                </h3>
                <p className="text-gray-600">
                  You can now access this space and start collaborating with other members.
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
              >
                Start Collaborating
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 