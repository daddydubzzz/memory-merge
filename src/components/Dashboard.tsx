'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  MessageCircle, 
  Settings, 
  LogOut, 
  Users, 
  Archive,
  Menu,
  Heart,
  Share2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  createPersonalSpace, 
  getUserProfile, 
  getUserSpaces, 
  KnowledgeService, 
  getTagStats,
  cleanupDuplicatePersonalSpaces,
  type Space
} from '@/lib/knowledge';
import { KnowledgeEntry } from '@/lib/constants';
import ChatInterface from './ChatInterface';
import KnowledgeHub from './KnowledgeHub';
import SpaceSwitcher from './SpaceSwitcher';
import CreateSpaceModal from './CreateSpaceModal';
import ShareLinkGenerator from './ShareLinkGenerator';

// Remove accountId prop since we'll manage spaces internally  
type DashboardProps = Record<string, never>;

export default function Dashboard({}: DashboardProps) {
  const { user, signout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [recentEntries, setRecentEntries] = useState<KnowledgeEntry[]>([]);
  const [tagStats, setTagStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // New space management state
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [showCreateSpaceModal, setShowCreateSpaceModal] = useState(false);
  const [showShareLinkGenerator, setShowShareLinkGenerator] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  
  // Add ref to prevent duplicate initialization
  const initializationRef = useRef(false);
  const currentUserRef = useRef<string | null>(null);
  
  // Memoize knowledge service based on current space
  const knowledgeService = useMemo(() => 
    currentSpaceId ? new KnowledgeService(currentSpaceId) : null, 
    [currentSpaceId]
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

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      // Prevent background scroll
      document.body.style.overflow = 'hidden';
      // Prevent touch scrolling on mobile
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      // Restore scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [sidebarOpen]);

  // Initialize user and create personal space if needed
  useEffect(() => {
    if (!user) {
      initializationRef.current = false;
      currentUserRef.current = null;
      setSpaces([]);
      setCurrentSpaceId(null);
      setIsInitializing(false);
      setInitializationError(null);
      return;
    }

    // Skip if already initialized for this user
    if (initializationRef.current && currentUserRef.current === user.uid) {
      return;
    }

    const initializeUser = async () => {
      // Set initialization flags
      initializationRef.current = true;
      currentUserRef.current = user.uid;
      setIsInitializing(true);
      setInitializationError(null);
      
      try {
        console.log('🔄 Initializing user:', user.uid);
        
        // Add a small delay to ensure AuthContext has finished its work
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get user profile
        let profile = await getUserProfile(user.uid);
        console.log('📋 User profile:', profile ? 'found' : 'not found');
        
        // Only create personal space if no profile exists at all
        // The AuthContext should have already handled this for new signups
        if (!profile) {
          console.log('⚠️ No user profile found after AuthContext processing - this might be an error case');
          console.log('🏗️ Creating personal space as fallback...');
          
          try {
            const personalSpaceId = await createPersonalSpace(
              user.uid, 
              user.displayName || undefined, 
              user.email || undefined
            );
            
            // Get the updated profile
            profile = await getUserProfile(user.uid);
            console.log('✅ Fallback personal space created:', personalSpaceId);
          } catch (spaceError) {
            console.error('❌ Failed to create fallback personal space:', spaceError);
            setInitializationError('Failed to create your personal space. Please try refreshing the page.');
            setIsInitializing(false);
            setLoading(false);
            return;
          }
        } else {
          console.log('✅ Using existing user profile');
        }

        if (profile) {
          setCurrentSpaceId(profile.activeSpaceId);
          
          // Load user's spaces
          try {
            const userSpaces = await getUserSpaces(user.uid);
            setSpaces(userSpaces);
            console.log('📚 Loaded spaces:', userSpaces.length);
            
            // Check for and clean up duplicate personal spaces
            await cleanupDuplicatePersonalSpaces(user.uid);
            
            // Reload spaces after cleanup in case duplicates were removed
            const cleanedSpaces = await getUserSpaces(user.uid);
            setSpaces(cleanedSpaces);
            
            // Double-check that the active space exists in the user's spaces
            if (!cleanedSpaces.find(s => s.id === profile.activeSpaceId)) {
              console.warn('⚠️ Active space not found in user spaces, using first available space');
              if (cleanedSpaces.length > 0) {
                setCurrentSpaceId(cleanedSpaces[0].id!);
              }
            }
          } catch (spacesError) {
            console.error('❌ Failed to load user spaces:', spacesError);
            setInitializationError('Failed to load your spaces. Please try refreshing the page.');
            setIsInitializing(false);
            setLoading(false);
            return;
          }
        } else {
          setInitializationError('Failed to set up your account. Please try refreshing the page.');
        }
      } catch (error) {
        console.error('❌ Error initializing user:', error);
        setInitializationError('Something went wrong setting up your account. Please try refreshing the page.');
        // Reset initialization flag on error so it can be retried
        initializationRef.current = false;
      }
      setIsInitializing(false);
      setLoading(false);
    };

    initializeUser();
  }, [user]);

  // Load dashboard data when space changes
  useEffect(() => {
    if (!knowledgeService || !currentSpaceId || isInitializing) return;

    let mounted = true;
    
    const loadData = async () => {
      try {
        // Load both in parallel for better performance
        const [entries, stats] = await Promise.all([
          knowledgeService.getRecentKnowledge(10),
          getTagStats(currentSpaceId)
        ]);
        
        if (mounted) {
          setRecentEntries(entries);
          setTagStats(stats);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [currentSpaceId, knowledgeService, isInitializing]);

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

  const handleSpaceChange = useCallback((spaceId: string) => {
    setCurrentSpaceId(spaceId);
    // Clear any existing data when switching spaces
    setRecentEntries([]);
    setTagStats({});
    setSelectedTag(null);
  }, []);

  const handleCreateSpace = useCallback(() => {
    setShowCreateSpaceModal(true);
  }, []);

  const handleSpaceCreated = useCallback(async (spaceId: string) => {
    // Refresh user's spaces and switch to new space
    try {
      const userSpaces = await getUserSpaces(user!.uid);
      setSpaces(userSpaces);
      setCurrentSpaceId(spaceId);
      setShowCreateSpaceModal(false);
    } catch (error) {
      console.error('Error refreshing spaces:', error);
    }
  }, [user]);

  const retryInitialization = () => {
    initializationRef.current = false;
    setInitializationError(null);
    setLoading(true);
    // The useEffect will trigger again when we change the ref
    if (user) {
      // Force re-initialization
      initializationRef.current = false;
      currentUserRef.current = null;
    }
  };

  // Show loading screen during initialization
  if (isInitializing || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/25 mx-auto mb-6 animate-pulse">
            <Heart className="w-8 h-8 text-white" fill="currentColor" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Setting up your space...</h2>
          <p className="text-gray-600">This will just take a moment</p>
        </div>
      </div>
    );
  }

  // Show error screen if initialization failed
  if (initializationError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Setup Failed</h2>
          <p className="text-gray-600 mb-6">{initializationError}</p>
          <div className="space-y-3">
            <button
              onClick={retryInitialization}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If no current space (shouldn't happen with new system, but fallback)
  if (!currentSpaceId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">No Space Available</h2>
          <p className="text-gray-600 mb-6">Your account setup is incomplete. Let&apos;s fix this.</p>
          <div className="space-y-3">
            <button
              onClick={retryInitialization}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
            >
              Complete Setup
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 via-gray-900 to-slate-900 text-white relative overflow-hidden lg:overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-1/4 right-0 w-24 h-24 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-full blur-2xl"></div>
      </div>

      {/* Header */}
      <div className="relative p-6 border-b border-white/10 backdrop-blur-sm flex-shrink-0">
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

      {/* Space Switcher */}
      <div className="relative p-6 border-b border-white/10 flex-shrink-0">
        <SpaceSwitcher
          currentSpaceId={currentSpaceId}
          onSpaceChange={handleSpaceChange}
          onCreateSpace={handleCreateSpace}
        />
      </div>

      {/* Navigation - Scrollable on mobile */}
      <nav className="flex-1 p-6 relative overflow-y-auto lg:overflow-visible">
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
                      selectedTag === tag ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'
                    }`}>
                      {tag}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    selectedTag === tag 
                      ? 'bg-blue-500/30 text-blue-100' 
                      : 'bg-white/10 text-gray-400 group-hover:bg-white/20 group-hover:text-gray-300'
                  }`}>
                    {count}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Archive className="w-6 h-6 text-gray-500" />
                </div>
                <p className="text-sm text-gray-500">No tags yet</p>
                <p className="text-xs text-gray-600 mt-1">Add knowledge to see popular tags</p>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-white/10 relative flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center px-4 py-3 text-gray-300 hover:text-white hover:bg-white/10 rounded-2xl transition-all duration-200 group border border-transparent hover:border-white/10"
        >
          <LogOut className="w-5 h-5 mr-3 transition-transform group-hover:scale-110" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-screen bg-gray-50">
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-30 p-3 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 text-gray-700 hover:text-gray-900 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Sidebar for larger screens */}
        <div className="hidden lg:flex lg:w-80 lg:flex-col">
          {sidebarContent}
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            {/* Background overlay */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Sidebar content - properly scrollable */}
            <div className="relative w-80 h-full flex flex-col">
              {sidebarContent}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeView === 'chat' && currentSpaceId && (
            <ChatInterface accountId={currentSpaceId} />
          )}
          {activeView === 'knowledge' && currentSpaceId && (
            <KnowledgeHub 
              accountId={currentSpaceId}
              selectedTag={selectedTag}
              onClearTagFilter={handleClearTagFilter}
            />
          )}
          {activeView === 'settings' && currentSpaceId && (
            <SettingsView 
              recentEntries={recentEntries} 
              tagStats={tagStats} 
              user={user}
              spaces={spaces}
              currentSpace={spaces.find(s => s.id === currentSpaceId) || null}
              onShowShareLinks={() => setShowShareLinkGenerator(true)}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateSpaceModal
        isOpen={showCreateSpaceModal}
        onClose={() => setShowCreateSpaceModal(false)}
        onSpaceCreated={handleSpaceCreated}
      />
      {currentSpaceId && spaces.find(s => s.id === currentSpaceId) && (
        <ShareLinkGenerator
          isOpen={showShareLinkGenerator}
          onClose={() => setShowShareLinkGenerator(false)}
          space={spaces.find(s => s.id === currentSpaceId)!}
        />
      )}
    </>
  );
}

// Settings view component
function SettingsView({ recentEntries, tagStats, user, spaces, currentSpace, onShowShareLinks }: { 
  recentEntries: KnowledgeEntry[]; 
  tagStats: Record<string, number>; 
  user: { displayName?: string | null; email?: string | null } | null;
  spaces: Space[];
  currentSpace: Space | null;
  onShowShareLinks: () => void;
}) {
  const totalEntries = recentEntries.length;
  const totalTags = Object.keys(tagStats).length;
  const mostUsedTag = Object.entries(tagStats).sort(([, a], [, b]) => b - a)[0];

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
                Manage your space and view usage statistics
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Current Space Information */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-500/10 border border-white/20 p-8 group hover:shadow-2xl hover:shadow-blue-500/15 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mr-4">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-blue-900 bg-clip-text text-transparent">
                    Current Space
                  </h3>
                </div>
                
                {currentSpace && (
                  <div className="space-y-6">
                    {/* Space Display */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-2xl p-4 border border-gray-200/50">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 bg-gradient-to-r ${getSpaceColor(currentSpace)} rounded-xl flex items-center justify-center text-white text-xl shadow-lg`}>
                          {currentSpace.icon || '👥'}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-gray-800">{currentSpace.name}</h4>
                          <p className="text-sm text-gray-600">
                            {currentSpace.type === 'personal' ? 'Personal space' : 'Shared space'} • {currentSpace.members.length} member{currentSpace.members.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Share Links (only for shared spaces) */}
                    {currentSpace.type === 'shared' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="block text-sm font-semibold text-gray-700">Share Links</label>
                          <button 
                            onClick={onShowShareLinks}
                            className="text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 flex items-center"
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Manage Links
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">
                          Create shareable links with custom settings and track usage
                        </p>
                      </div>
                    )}
                    
                    {/* User info */}
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
                )}
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

                  <div className="bg-gradient-to-r from-purple-50 to-violet-100/50 border border-purple-200/50 rounded-2xl p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-violet-600 rounded-full mr-3"></div>
                        <span className="text-sm font-semibold text-gray-700">Total Spaces</span>
                      </div>
                      <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-violet-700 bg-clip-text text-transparent">
                        {spaces.length}
                      </span>
                    </div>
                  </div>
                  
                  {mostUsedTag && (
                    <div className="bg-gradient-to-r from-orange-50 to-orange-100/50 border border-orange-200/50 rounded-2xl p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full mr-3"></div>
                          <span className="text-sm font-semibold text-gray-700">Most Used Tag</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent">
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