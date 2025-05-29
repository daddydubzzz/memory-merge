'use client';

import React, { useState } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createSharedSpace } from '@/lib/knowledge';

interface CreateSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpaceCreated: (spaceId: string) => void;
}

const colorOptions = [
  { name: 'Blue', value: 'blue', class: 'from-blue-500 to-blue-600' },
  { name: 'Purple', value: 'purple', class: 'from-purple-500 to-purple-600' },
  { name: 'Green', value: 'green', class: 'from-green-500 to-green-600' },
  { name: 'Orange', value: 'orange', class: 'from-orange-500 to-orange-600' },
  { name: 'Pink', value: 'pink', class: 'from-pink-500 to-pink-600' },
  { name: 'Red', value: 'red', class: 'from-red-500 to-red-600' },
];

const emojiOptions = ['👥', '💼', '📚', '🚀', '❤️', '🧠', '🎯', '✨', '🌟', '🔥', '💡', '🎨'];

export default function CreateSpaceModal({ isOpen, onClose, onSpaceCreated }: CreateSpaceModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'customize' | 'created'>('customize');
  const [spaceName, setSpaceName] = useState('');
  const [spaceIcon, setSpaceIcon] = useState('👥');
  const [spaceColor, setSpaceColor] = useState('purple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  const resetState = () => {
    setStep('customize');
    setSpaceName('');
    setSpaceIcon('👥');
    setSpaceColor('purple');
    setError('');
    setInviteCode('');
    setCopied(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleCreateSpace = async () => {
    if (!user || !spaceName.trim()) {
      setError('Please enter a space name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await createSharedSpace(user.uid, spaceName.trim(), spaceIcon, spaceColor);
      setInviteCode(result.inviteCode);
      setStep('created');
      onSpaceCreated(result.spaceId);
    } catch (error) {
      console.error('Error creating space:', error);
      setError('Failed to create space. Please try again.');
    }

    setLoading(false);
  };

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy invite code:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-purple-900 bg-clip-text text-transparent">
              {step === 'customize' && 'Create New Space'}
              {step === 'created' && 'Space Created! 🎉'}
            </h2>
            <p className="text-gray-600 mt-1">
              {step === 'customize' && 'Personalize your shared knowledge space'}
              {step === 'created' && 'Your space is ready for collaboration'}
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {step === 'customize' && (
            <div className="space-y-6">
              {/* Space Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Space Name</label>
                <input
                  type="text"
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  placeholder="Enter a name for your space"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200 text-gray-900 placeholder-gray-400"
                  autoFocus
                />
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Choose an Icon</label>
                <div className="grid grid-cols-6 gap-2">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setSpaceIcon(emoji)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg transition-all duration-200 ${
                        spaceIcon === emoji
                          ? 'bg-purple-100 border-2 border-purple-500 shadow-lg'
                          : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Choose a Color</label>
                <div className="grid grid-cols-3 gap-3">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setSpaceColor(color.value)}
                      className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                        spaceColor === color.value
                          ? 'border-gray-900 shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-6 h-6 bg-gradient-to-r ${color.class} rounded-lg shadow-sm`}></div>
                        <span className="text-sm font-medium text-gray-700">{color.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Preview</h4>
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 bg-gradient-to-r ${colorOptions.find(c => c.value === spaceColor)?.class} rounded-xl flex items-center justify-center text-white text-lg shadow-lg`}>
                    {spaceIcon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{spaceName || 'Your Space Name'}</p>
                    <p className="text-sm text-gray-600">Shared space • 1 member</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div>
                <button
                  onClick={handleCreateSpace}
                  disabled={loading || !spaceName.trim()}
                  className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-purple-800 transition-all duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Space'
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'created' && (
            <div className="text-center space-y-6">
              {/* Success Icon */}
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
              </div>

              {/* Space Info */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-6">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <div className={`w-12 h-12 bg-gradient-to-r ${colorOptions.find(c => c.value === spaceColor)?.class} rounded-xl flex items-center justify-center text-white text-xl shadow-lg`}>
                    {spaceIcon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{spaceName}</h3>
                    <p className="text-gray-600">Shared space • Ready for collaboration</p>
                  </div>
                </div>

                {/* Invite Code */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Invite Code</label>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 px-3 py-2 bg-gray-50 rounded-lg font-mono text-lg font-bold text-center text-gray-800 border">
                      {inviteCode}
                    </code>
                    <button
                      onClick={handleCopyInviteCode}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        copied
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200'
                      }`}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Share this code with others to invite them to your space
                  </p>
                </div>
              </div>

              <button
                onClick={handleClose}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 transition-all duration-200"
              >
                Start Using Space
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 