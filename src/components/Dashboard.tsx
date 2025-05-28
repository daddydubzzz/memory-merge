'use client';

import React, { useState, useEffect } from 'react';
import { 
  MessageCircle, 
  Settings, 
  LogOut, 
  Users, 
  Archive,
  Plus,
  Menu,
  X,
  Heart
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountByMember, createAccount, KnowledgeService } from '@/lib/knowledge';
import { KNOWLEDGE_CATEGORIES } from '@/lib/constants';
import ChatInterface from './ChatInterface';

interface DashboardProps {
  accountId: string | null;
  onAccountSetup: (accountId: string) => void;
}

export default function Dashboard({ accountId, onAccountSetup }: DashboardProps) {
  const { user, signout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  
  const knowledgeService = accountId ? new KnowledgeService(accountId) : null;

  // Load recent entries and stats
  useEffect(() => {
    if (knowledgeService) {
      const loadData = async () => {
        const entries = await knowledgeService.getRecentKnowledge(10);
        setRecentEntries(entries);
        
        // Calculate category stats
        const stats: Record<string, number> = {};
        entries.forEach((entry: any) => {
          stats[entry.category] = (stats[entry.category] || 0) + 1;
        });
        setCategoryStats(stats);
      };
      loadData();
    }
  }, [accountId]);

  const handleSignOut = async () => {
    try {
      await signout();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

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
          <button
            onClick={() => {
              setActiveView('chat');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors ${
              activeView === 'chat'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <MessageCircle className="w-5 h-5 mr-3" />
            Chat
          </button>

          <button
            onClick={() => {
              setActiveView('browse');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors ${
              activeView === 'browse'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Archive className="w-5 h-5 mr-3" />
            Browse Knowledge
          </button>

          <button
            onClick={() => {
              setActiveView('settings');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors ${
              activeView === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Settings className="w-5 h-5 mr-3" />
            Settings
          </button>
        </div>

        {/* Category Stats */}
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Categories</h3>
          <div className="space-y-2">
            {KNOWLEDGE_CATEGORIES.map((category) => (
              <div
                key={category}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-300">{category}</span>
                <span className="text-gray-500">{categoryStats[category] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
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
          {activeView === 'browse' && <BrowseView accountId={accountId} />}
          {activeView === 'settings' && <SettingsView />}
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Your Shared Account</h1>
          <p className="text-gray-600">
            Set up a shared knowledge space that you and your family, partner, or household members can all access and contribute to
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreateAccount}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {loading ? 'Creating Account...' : 'Create Shared Account'}
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

// Browse view component
function BrowseView({ accountId }: { accountId: string }) {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Browse Knowledge</h2>
      <p className="text-gray-600">Browse and organize your shared knowledge by categories.</p>
      {/* TODO: Implement knowledge browsing interface */}
    </div>
  );
}

// Settings view component
function SettingsView() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>
      <p className="text-gray-600">Manage your account and preferences.</p>
      {/* TODO: Implement settings interface */}
    </div>
  );
} 