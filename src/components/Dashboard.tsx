'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  MessageCircle, 
  Settings, 
  LogOut, 
  Users, 
  Archive,
  Plus,
  Menu,
  Heart
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createAccount, KnowledgeService, getTagStats } from '@/lib/knowledge';
import { KnowledgeEntry } from '@/lib/constants';
import ChatInterface from './ChatInterface';
import KnowledgeHub from './KnowledgeHub';

interface DashboardProps {
  accountId: string | null;
  onAccountSetup: (accountId: string) => void;
}

export default function Dashboard({ accountId, onAccountSetup }: DashboardProps) {
  const { user, signout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [recentEntries, setRecentEntries] = useState<KnowledgeEntry[]>([]);
  const [tagStats, setTagStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  
  // Memoize knowledge service to prevent recreation on every render
  const knowledgeService = useMemo(() => 
    accountId ? new KnowledgeService(accountId) : null, 
    [accountId]
  );

  // Memoize expensive computations
  const topTags = useMemo(() => 
    Object.entries(tagStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10), 
    [tagStats]
  );

  // Navigation items configuration
  const navigationItems = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'knowledge', label: 'Knowledge Hub', icon: Archive },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  // Load recent entries and tag stats (only when accountId changes)
  useEffect(() => {
    if (!knowledgeService || !accountId) return;

    let mounted = true;
    
    const loadData = async () => {
      if (loading) return; // Prevent multiple simultaneous loads
      
      setLoading(true);
      try {
        // Load both in parallel for better performance
        const [entries, stats] = await Promise.all([
          knowledgeService.getRecentKnowledge(10),
          getTagStats(accountId)
        ]);
        
        if (mounted) {
          setRecentEntries(entries);
          setTagStats(stats);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [accountId, knowledgeService]); // Only depend on accountId changes

  // Memoize callbacks to prevent unnecessary re-renders
  const handleSignOut = useCallback(async () => {
    try {
      await signout();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [signout]);

  const handleViewChange = useCallback((view: string) => {
    setActiveView(view);
    setSidebarOpen(false);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    // TODO: Implement tag filtering in knowledge view
    console.log('Tag clicked:', tag);
    setActiveView('knowledge');
    setSidebarOpen(false);
  }, []);

  // If no account, show setup screen
  if (!accountId) {
    return <AccountSetup onAccountCreated={onAccountSetup} />;
  }

  const sidebarContent = (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center">
          <Heart className="w-6 h-6 text-pink-400 mr-2" />
          <h1 className="text-lg font-semibold">Memory Merge</h1>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Welcome, {user?.displayName || user?.email?.split('@')[0]}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleViewChange(item.id)}
              className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors ${
                activeView === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Enhanced Popular Tags Section */}
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Popular Tags</h3>
          <div className="space-y-2">
            {topTags.length > 0 ? (
              topTags.map(([tag, count]) => (
                <div
                  key={tag}
                  className="flex items-center justify-between text-sm cursor-pointer hover:bg-gray-700 px-2 py-1 rounded group"
                  onClick={() => handleTagClick(tag)}
                >
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 opacity-60 group-hover:opacity-100" />
                    <span className="text-gray-300">{tag}</span>
                  </div>
                  <span className="text-gray-500 text-xs">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No tags yet</p>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center px-3 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black opacity-50" onClick={() => setSidebarOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-64 z-50">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block w-64 bg-gray-900">
        {sidebarContent}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Memory Merge</h1>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1">
          {activeView === 'chat' && <ChatInterface accountId={accountId} />}
          {activeView === 'knowledge' && <KnowledgeHub accountId={accountId} />}
          {activeView === 'settings' && (
            <SettingsView 
              accountId={accountId} 
              recentEntries={recentEntries} 
              tagStats={tagStats} 
              user={user} 
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Account setup component
function AccountSetup({ onAccountCreated }: { onAccountCreated: (accountId: string) => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  const handleCreateAccount = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const accountId = await createAccount([user.uid]);
      onAccountCreated(accountId);
    } catch (error) {
      console.error('Error creating account:', error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <Heart className="w-12 h-12 text-pink-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Your Shared Space</h1>
          <p className="text-gray-600">
            Set up a shared knowledge space that you and your team, group, or collaborators can all access and contribute to
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreateAccount}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {loading ? 'Creating Space...' : 'Create Knowledge Space'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <div>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code from another member"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              disabled={!inviteCode.trim() || loading}
              className="w-full mt-2 bg-gray-500 text-white py-2 px-4 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center justify-center"
            >
              <Users className="w-5 h-5 mr-2" />
              Join Existing Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings view component
function SettingsView({ accountId, recentEntries, tagStats, user }: { 
  accountId: string; 
  recentEntries: KnowledgeEntry[]; 
  tagStats: Record<string, number>; 
  user: { displayName?: string | null; email?: string | null } | null 
}) {
  const totalEntries = recentEntries.length;
  const totalTags = Object.keys(tagStats).length;
  const mostUsedTag = Object.entries(tagStats).sort(([, a], [, b]) => b - a)[0];

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>
      
      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600">Account ID</label>
              <div className="mt-1 p-2 bg-gray-50 rounded border text-sm text-gray-800 font-mono">
                {accountId}
              </div>
              <p className="text-xs text-gray-500 mt-1">Share this ID with others to invite them to your knowledge space</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Signed in as</label>
              <p className="text-sm text-gray-800">{user?.displayName || user?.email}</p>
            </div>
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Statistics</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Knowledge Entries</span>
              <span className="text-lg font-semibold text-blue-600">{totalEntries}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Total Tags</span>
              <span className="text-lg font-semibold text-green-600">{totalTags}</span>
            </div>
            {mostUsedTag && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Most Used Tag</span>
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">{mostUsedTag[0]} ({mostUsedTag[1]})</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 