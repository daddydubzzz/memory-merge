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
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
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
  }, [accountId, knowledgeService, loading]); // Added loading dependency

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
    // Clear tag filter when switching away from knowledge view
    if (view !== 'knowledge') {
      setSelectedTag(null);
    }
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTag(tag);
    setActiveView('knowledge');
    setSidebarOpen(false);
  }, []);

  const handleClearTagFilter = useCallback(() => {
    setSelectedTag(null);
  }, []);

  // If no account, show setup screen
  if (!accountId) {
    return <AccountSetup onAccountCreated={onAccountSetup} />;
  }

  const sidebarContent = (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 via-gray-900 to-slate-900 text-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-1/4 right-0 w-24 h-24 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-full blur-2xl"></div>
      </div>

      {/* Header */}
      <div className="relative p-6 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center mb-3">
          <div className="relative">
            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/25">
              <Heart className="w-5 h-5 text-white" fill="currentColor" />
            </div>
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent ml-3">
            Memory Merge
          </h1>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
          <p className="text-sm text-gray-300 font-medium">
            Welcome back, {user?.displayName || user?.email?.split('@')[0] || 'User'}! 👋
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-6 relative">
        <div className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleViewChange(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded-2xl transition-all duration-200 group relative overflow-hidden ${
                activeView === item.id
                  ? 'bg-gradient-to-r from-blue-600/80 to-purple-600/80 text-white shadow-lg shadow-blue-500/25 backdrop-blur-sm border border-white/20'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white hover:backdrop-blur-sm border border-transparent hover:border-white/10'
              }`}
            >
              {activeView === item.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl"></div>
              )}
              <item.icon className={`w-5 h-5 mr-3 relative z-10 transition-transform group-hover:scale-110 ${
                activeView === item.id ? 'text-white' : ''
              }`} />
              <span className="relative z-10 font-medium">{item.label}</span>
              {activeView === item.id && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
        </div>

        {/* Enhanced Popular Tags Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Popular Tags</h3>
          </div>
          <div className="space-y-1">
            {topTags.length > 0 ? (
              topTags.map(([tag, count]) => (
                <div
                  key={tag}
                  className={`flex items-center justify-between text-sm cursor-pointer px-3 py-2 rounded-xl group transition-all duration-200 border backdrop-blur-sm ${
                    selectedTag === tag
                      ? 'bg-blue-500/20 border-blue-400/30 text-white'
                      : 'hover:bg-white/10 border-transparent hover:border-white/10'
                  }`}
                  onClick={() => handleTagClick(tag)}
                >
                  <div className="flex items-center">
                    <div className={`w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mr-3 transition-opacity ${
                      selectedTag === tag ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
                    }`}></div>
                    <span className={`transition-colors font-medium ${
                      selectedTag === tag ? 'text-white' : 'text-gray-300 group-hover:text-white'
                    }`}>{tag}</span>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-lg font-semibold transition-colors ${
                    selectedTag === tag 
                      ? 'bg-blue-400/30 text-white' 
                      : 'bg-white/10 text-gray-400 group-hover:text-white'
                  }`}>
                    {count}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-4 text-center">
                <p className="text-sm text-gray-500 mb-1">No tags yet</p>
                <p className="text-xs text-gray-600">Start adding memories to see popular tags</p>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="relative p-6 border-t border-white/10 backdrop-blur-sm">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center px-4 py-3 text-gray-300 hover:text-white bg-white/5 hover:bg-red-500/20 rounded-2xl transition-all duration-200 group border border-white/10 hover:border-red-500/30 backdrop-blur-sm"
        >
          <LogOut className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
          <span className="font-medium">Sign Out</span>
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
        <div className="lg:hidden bg-white/80 backdrop-blur-xl border-b border-gray-200/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl hover:bg-gray-100/80 transition-all duration-200 hover:scale-110 active:scale-95"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex items-center">
              <div className="relative mr-2">
                <div className="w-6 h-6 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg flex items-center justify-center shadow-lg shadow-pink-500/25">
                  <Heart className="w-4 h-4 text-white" fill="currentColor" />
                </div>
              </div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
                Memory Merge
              </h1>
            </div>
            <div className="w-9" /> {/* Spacer */}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1">
          {activeView === 'chat' && <ChatInterface accountId={accountId} />}
          {activeView === 'knowledge' && <KnowledgeHub accountId={accountId} selectedTag={selectedTag} onClearTagFilter={handleClearTagFilter} />}
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-200/30 to-purple-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-200/20 to-orange-200/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative w-full max-w-lg">
        {/* Main Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-500/10 border border-white/20 p-8 sm:p-10">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/25">
                  <Heart className="w-8 h-8 text-white" fill="currentColor" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full flex items-center justify-center animate-pulse">
                  <Plus className="w-3 h-3 text-white" />
                </div>
              </div>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent mb-4">
              Create Your Shared Space
            </h1>
            <p className="text-gray-600/80 text-lg leading-relaxed max-w-md mx-auto">
              Set up a shared knowledge space that you and your team, group, or collaborators can all access and contribute to
            </p>
          </div>

          <div className="space-y-6">
            {/* Create Account Button */}
            <button
              onClick={handleCreateAccount}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-4 px-6 rounded-2xl font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center group"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Creating Space...
                </div>
              ) : (
                <>
                  <Plus className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  Create Knowledge Space
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200/60" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white/80 text-gray-500 font-medium backdrop-blur-sm">or join existing</span>
              </div>
            </div>

            {/* Join Account Section */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="inviteCode" className="block text-sm font-semibold text-gray-700">
                  Invite Code
                </label>
                <div className="relative group">
                  <Users className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
                  <input
                    id="inviteCode"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter invite code from another member"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border border-gray-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 focus:bg-white/80 transition-all duration-200 text-gray-900 placeholder-gray-400"
                  />
                </div>
              </div>
              
              <button
                disabled={!inviteCode.trim() || loading}
                className="w-full bg-white/80 backdrop-blur-sm border border-gray-200/50 text-gray-700 py-4 px-6 rounded-2xl font-semibold text-base hover:bg-white hover:shadow-lg hover:shadow-gray-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center group hover:scale-[1.02] active:scale-[0.98]"
              >
                <Users className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                Join Existing Account
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500/80">
            🚀 Ready to merge memories together
          </p>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-200/15 to-orange-200/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 p-6 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25 mr-4">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-purple-900 to-pink-900 bg-clip-text text-transparent">
                Settings
              </h1>
              <p className="text-gray-600/80 text-lg">
                Manage your account and view usage statistics
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Account Information */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-500/10 border border-white/20 p-8 group hover:shadow-2xl hover:shadow-blue-500/15 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mr-4">
                    <Settings className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-blue-900 bg-clip-text text-transparent">
                    Account Information
                  </h3>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Account ID</label>
                    <div className="relative group">
                      <div className="p-4 bg-gray-50/50 border border-gray-200/50 rounded-2xl text-sm text-gray-800 font-mono break-all group-hover:bg-white/80 transition-all duration-200">
                        {accountId}
                      </div>
                      <button 
                        onClick={() => navigator.clipboard.writeText(accountId)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                      Share this ID with others to invite them to your knowledge space
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Signed in as</label>
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200/50 rounded-2xl p-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold text-sm mr-3">
                          {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {user?.displayName || 'User'}
                          </p>
                          <p className="text-xs text-gray-600">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-500/10 border border-white/20 p-8 group hover:shadow-2xl hover:shadow-blue-500/15 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/25 mr-4">
                    <Archive className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-green-900 bg-clip-text text-transparent">
                    Usage Statistics
                  </h3>
                </div>
                
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200/50 rounded-2xl p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full mr-3"></div>
                        <span className="text-sm font-semibold text-gray-700">Knowledge Entries</span>
                      </div>
                      <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
                        {totalEntries}
                      </span>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-green-50 to-emerald-100/50 border border-green-200/50 rounded-2xl p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full mr-3"></div>
                        <span className="text-sm font-semibold text-gray-700">Total Tags</span>
                      </div>
                      <span className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-700 bg-clip-text text-transparent">
                        {totalTags}
                      </span>
                    </div>
                  </div>
                  
                  {mostUsedTag && (
                    <div className="bg-gradient-to-r from-purple-50 to-violet-100/50 border border-purple-200/50 rounded-2xl p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-violet-600 rounded-full mr-3"></div>
                          <span className="text-sm font-semibold text-gray-700">Most Used Tag</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold bg-gradient-to-r from-purple-600 to-violet-700 bg-clip-text text-transparent">
                            {mostUsedTag[0]}
                          </div>
                          <div className="text-xs text-gray-500">
                            {mostUsedTag[1]} entries
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 