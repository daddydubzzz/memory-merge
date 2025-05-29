'use client';

import React, { useState, useEffect } from 'react';
import { Share2, Copy, CheckCircle, Trash2, Plus, Clock, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  createShareLink, 
  getSpaceShareLinks, 
  deactivateShareLink,
  type ShareLink,
  type Space 
} from '@/lib/knowledge';

interface ShareLinkGeneratorProps {
  space: Space;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareLinkGenerator({ space, isOpen, onClose }: ShareLinkGeneratorProps) {
  const { user } = useAuth();
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Form state
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(7);
  const [maxUses, setMaxUses] = useState<number | undefined>();
  const [customMessage, setCustomMessage] = useState('');

  // Load existing share links
  useEffect(() => {
    const loadShareLinks = async () => {
      if (!space.id || !user) return;
      
      setLoading(true);
      try {
        const links = await getSpaceShareLinks(space.id, user.uid);
        setShareLinks(links);
      } catch (error) {
        console.error('Error loading share links:', error);
      }
      setLoading(false);
    };

    if (isOpen && space.id && user) {
      loadShareLinks();
    }
  }, [isOpen, space.id, user]);

  const handleCreateShareLink = async () => {
    if (!space.id || !user) return;

    setCreating(true);
    try {
      const result = await createShareLink(space.id, user.uid, {
        expiresInDays,
        maxUses,
        customMessage: customMessage.trim() || undefined,
      });

      // Add to local state
      setShareLinks(prev => [result.shareLink, ...prev]);
      
      // Reset form
      setShowCreateForm(false);
      setExpiresInDays(7);
      setMaxUses(undefined);
      setCustomMessage('');
      
      // Auto-copy the new link
      await copyToClipboard(result.shareUrl);
      
    } catch (error) {
      console.error('Error creating share link:', error);
      alert('Failed to create share link. Please try again.');
    }
    setCreating(false);
  };

  const handleDeactivateLink = async (linkId: string) => {
    if (!user) return;
    
    try {
      const success = await deactivateShareLink(linkId, user.uid);
      if (success) {
        setShareLinks(prev => 
          prev.map(link => 
            link.id === linkId ? { ...link, isActive: false } : link
          )
        );
      }
    } catch (error) {
      console.error('Error deactivating share link:', error);
      alert('Failed to deactivate link. Please try again.');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const formatExpiration = (date?: Date) => {
    if (!date) return 'Never expires';
    return `Expires ${date.toLocaleDateString()}`;
  };

  const isExpired = (date?: Date) => {
    if (!date) return false;
    return date < new Date();
  };

  const getShareUrl = (token: string) => {
    // In browser environment, we can use window.location
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}/join/${token}`;
    }
    
    // In server environment, check environment variables
    const envUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (envUrl) {
      return `${envUrl}/join/${token}`;
    }
    
    // Check Vercel environment
    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) {
      return `https://${vercelUrl}/join/${token}`;
    }
    
    // Default fallback for development
    return `http://localhost:3000/join/${token}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mr-4">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-blue-900 bg-clip-text text-transparent">
                Share Links
              </h2>
              <p className="text-gray-600 mt-1">
                Create and manage invite links for &quot;{space.name}&quot;
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Create New Link Button */}
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full mb-6 p-4 border-2 border-dashed border-gray-300 rounded-2xl hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200 group"
            >
              <div className="flex items-center justify-center">
                <Plus className="w-5 h-5 text-gray-400 group-hover:text-blue-500 mr-2" />
                <span className="text-gray-600 group-hover:text-blue-600 font-medium">
                  Create New Share Link
                </span>
              </div>
            </button>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200/50">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Create New Share Link</h3>
              
              <div className="space-y-4">
                {/* Expiration */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Expiration
                  </label>
                  <select
                    value={expiresInDays || ''}
                    onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-900"
                  >
                    <option value="">Never expires</option>
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                  </select>
                </div>

                {/* Usage Limit */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Usage Limit (optional)
                  </label>
                  <input
                    type="number"
                    value={maxUses || ''}
                    onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Unlimited"
                    min="1"
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                  />
                </div>

                {/* Custom Message */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Personal Message (optional)
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Add a personal message to your invite..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none text-gray-900 placeholder-gray-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex space-x-3">
                  <button
                    onClick={handleCreateShareLink}
                    disabled={creating}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
                  >
                    {creating ? 'Creating...' : 'Create Share Link'}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Existing Share Links */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading share links...</p>
              </div>
            ) : shareLinks.length === 0 ? (
              <div className="text-center py-8">
                <Share2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No share links created yet</p>
                <p className="text-gray-500 text-sm">Create your first share link to invite others</p>
              </div>
            ) : (
              shareLinks.map((link) => (
                <div
                  key={link.id}
                  className={`bg-white/80 backdrop-blur-sm rounded-2xl p-4 border transition-all duration-200 ${
                    link.isActive && !isExpired(link.expiresAt)
                      ? 'border-gray-200/50 hover:shadow-lg'
                      : 'border-red-200/50 bg-red-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <div className={`w-3 h-3 rounded-full mr-3 ${
                          link.isActive && !isExpired(link.expiresAt) 
                            ? 'bg-green-500' 
                            : 'bg-red-500'
                        }`}></div>
                        <span className="font-mono text-sm bg-gray-100 px-3 py-1 rounded-lg text-gray-800">
                          {link.token}
                        </span>
                        <span className={`ml-3 text-xs px-2 py-1 rounded-full ${
                          link.isActive && !isExpired(link.expiresAt)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {link.isActive 
                            ? isExpired(link.expiresAt) ? 'Expired' : 'Active'
                            : 'Deactivated'
                          }
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-2" />
                          {formatExpiration(link.expiresAt)}
                        </div>
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-2" />
                          {link.usageCount} {link.maxUses ? `/ ${link.maxUses}` : ''} uses
                        </div>
                      </div>

                      {link.customMessage && (
                        <div className="bg-blue-50/50 rounded-lg p-3 mb-3">
                          <p className="text-sm text-blue-800 italic">&quot;{link.customMessage}&quot;</p>
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <code className="flex-1 text-xs bg-gray-50 px-3 py-2 rounded-lg font-mono break-all text-gray-700">
                          {getShareUrl(link.token)}
                        </code>
                        <button
                          onClick={() => copyToClipboard(getShareUrl(link.token))}
                          className={`px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                            copied === getShareUrl(link.token)
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                        >
                          {copied === getShareUrl(link.token) ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {link.isActive && (
                      <button
                        onClick={() => handleDeactivateLink(link.id!)}
                        className="ml-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deactivate link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 