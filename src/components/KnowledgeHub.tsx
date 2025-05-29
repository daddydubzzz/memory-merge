'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Tag, Clock, User, Archive } from 'lucide-react';
import { KnowledgeService, getUserDisplayName } from '@/lib/knowledge';
import type { KnowledgeEntry } from '@/lib/constants';

interface KnowledgeHubProps {
  accountId: string;
  selectedTag?: string | null;
  onClearTagFilter?: () => void;
}

export default function KnowledgeHub({ accountId, selectedTag, onClearTagFilter }: KnowledgeHubProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recentEntries, setRecentEntries] = useState<KnowledgeEntry[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [allEntries, setAllEntries] = useState<KnowledgeEntry[]>([]); // Store all entries for tag calculation

  const knowledgeService = useMemo(() => new KnowledgeService(accountId), [accountId]);

  // Calculate available tags from all entries
  const availableTags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    allEntries.forEach(entry => {
      entry.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    return Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a) // Sort by count descending
      .slice(0, 20); // Show top 20 tags
  }, [allEntries]);

  // Update selectedTags when selectedTag prop changes
  useEffect(() => {
    if (selectedTag) {
      setSelectedTags([selectedTag]);
      setSearchTerm(''); // Clear search when filtering by tag
    } else {
      setSelectedTags([]);
    }
  }, [selectedTag]);

  // Load user names for entries
  const loadUserNames = useCallback(async (entries: KnowledgeEntry[]) => {
    const uniqueUserIds = [...new Set(entries.map(entry => entry.addedBy))];
    const userNamePromises = uniqueUserIds.map(async (userId) => {
      const displayName = await getUserDisplayName(userId);
      return { userId, displayName };
    });
    
    const userNameResults = await Promise.all(userNamePromises);
    const userNameMap = userNameResults.reduce((acc, { userId, displayName }) => {
      acc[userId] = displayName;
      return acc;
    }, {} as Record<string, string>);
    
    setUserNames(prev => ({ ...prev, ...userNameMap }));
  }, []);

  const loadRecentEntries = useCallback(async () => {
    try {
      const entries = await knowledgeService.getRecentKnowledge(100); // Load more for better tag calculation
      setAllEntries(entries); // Store all entries for tag calculation
      
      // Filter entries based on selected tags (OR logic - show if entry has ANY of the selected tags)
      const filteredEntries = selectedTags.length > 0 
        ? entries.filter(entry => selectedTags.some(selectedTag => entry.tags.includes(selectedTag)))
        : entries.slice(0, 20); // Show only 20 for display if no filter
      
      setRecentEntries(filteredEntries);
      // Load user names for these entries
      await loadUserNames(filteredEntries);
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setIsLoading(false);
    }
  }, [knowledgeService, loadUserNames, selectedTags]);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      // If no search query, load recent entries
      loadRecentEntries();
      return;
    }
    
    setIsLoading(true);
    try {
      const results = await knowledgeService.searchKnowledge(
        [query],
        selectedTags.length > 0 ? selectedTags : undefined
      );
      setRecentEntries(results);
      // Load user names for search results
      await loadUserNames(results);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsLoading(false);
    }
  }, [knowledgeService, selectedTags, loadRecentEntries, loadUserNames]);

  // Handle tag selection
  const handleTagSelect = useCallback((tag: string) => {
    setSelectedTags(prev => {
      const isSelected = prev.includes(tag);
      if (isSelected) {
        // Remove tag if already selected
        return prev.filter(t => t !== tag);
      } else {
        // Add tag if not selected (allow multiple selections)
        return [...prev, tag];
      }
    });
    setSearchTerm(''); // Clear search when changing tags
    onClearTagFilter?.(); // Clear the sidebar selection
  }, [onClearTagFilter]);

  // Clear all tag filters
  const handleClearAllTags = useCallback(() => {
    setSelectedTags([]);
    setSearchTerm('');
    onClearTagFilter?.();
  }, [onClearTagFilter]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, performSearch]);

  useEffect(() => {
    loadRecentEntries();
  }, [loadRecentEntries]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-200/15 to-orange-200/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative h-full flex flex-col">
        {/* Header Section */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 p-6 shadow-sm">
          <div className="max-w-4xl mx-auto">
            {/* Title */}
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mr-4">
                <Archive className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
                  Knowledge Hub
                </h1>
                <p className="text-gray-600/80 text-lg">
                  Search and browse your memories
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative group mb-4">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder={selectedTag ? `Search in #${selectedTag}...` : selectedTags.length > 0 ? `Search in ${selectedTags.length === 1 ? `#${selectedTags[0]}` : `${selectedTags.length} selected tags`}...` : "Search your knowledge..."}
                className="w-full pl-12 pr-12 py-4 bg-gray-50/50 border border-gray-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 focus:bg-white/80 transition-all duration-200 text-gray-900 placeholder-gray-400 text-lg"
              />
              {(isLoading || (searchTerm && isLoading)) && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500/30 border-t-blue-500"></div>
                </div>
              )}
            </div>
            
            {/* Active Tag Filter */}
            {(selectedTag || selectedTags.length > 0) && (
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600 font-medium">Filtered by:</span>
                {selectedTag && (
                  <div className="inline-flex items-center bg-gradient-to-r from-blue-50 to-blue-100/50 text-blue-700 border border-blue-200/50 px-3 py-1 rounded-xl text-sm font-medium">
                    <Tag className="w-3 h-3 mr-1" />
                    {selectedTag}
                    <button 
                      onClick={() => {
                        setSelectedTags([]);
                        setSearchTerm('');
                        onClearTagFilter?.();
                      }}
                      className="ml-2 text-blue-600 hover:text-blue-800 transition-colors"
                      title="Clear filter"
                    >
                      ×
                    </button>
                  </div>
                )}
                {!selectedTag && selectedTags.map(tag => (
                  <div key={tag} className="inline-flex items-center bg-gradient-to-r from-blue-50 to-blue-100/50 text-blue-700 border border-blue-200/50 px-3 py-1 rounded-xl text-sm font-medium">
                    <Tag className="w-3 h-3 mr-1" />
                    {tag}
                    <button 
                      onClick={() => handleTagSelect(tag)}
                      className="ml-2 text-blue-600 hover:text-blue-800 transition-colors"
                      title="Remove filter"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!selectedTag && selectedTags.length > 1 && (
                  <button
                    onClick={handleClearAllTags}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors px-2 py-1 bg-blue-50/50 rounded-lg"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
            
            {/* All Available Tags */}
            {!searchTerm.trim() && availableTags.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Filter by Tags</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(([tag, count]) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => handleTagSelect(tag)}
                        className={`inline-flex items-center px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200 hover:scale-105 active:scale-95 ${
                          isSelected
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white border-blue-400/50 shadow-lg shadow-blue-500/25'
                            : 'bg-white/80 backdrop-blur-sm text-gray-700 border-gray-200/50 hover:bg-blue-50 hover:border-blue-300/50 hover:text-blue-700'
                        }`}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                        <span className={`ml-2 px-2 py-0.5 rounded-lg text-xs font-bold ${
                          isSelected 
                            ? 'bg-white/20 text-white' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Stats */}
            <div className="flex items-center space-x-6 text-sm">
              <div className="bg-white/50 backdrop-blur-sm rounded-xl px-3 py-2 border border-gray-200/50">
                <span className="text-gray-700 font-medium">
                  {selectedTag 
                    ? `${recentEntries.length} entries with #${selectedTag}`
                    : selectedTags.length > 0
                      ? `${recentEntries.length} entries with ${selectedTags.length === 1 ? `#${selectedTags[0]}` : `${selectedTags.length} selected tags`}`
                      : searchTerm.trim() 
                        ? `${recentEntries.length} search results` 
                        : `${recentEntries.length} entries`
                  }
                </span>
              </div>
              <div className="flex items-center text-gray-500">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                <span>Live updated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            {isLoading ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mx-auto mb-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/30 border-t-white"></div>
                </div>
                <p className="text-gray-600 text-lg font-medium">Loading knowledge...</p>
                <p className="text-gray-500 text-sm mt-1">Searching through your memories</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentEntries.map((entry) => (
                  <KnowledgeCard key={entry.id} entry={entry} searchQuery={searchTerm} userName={userNames[entry.addedBy] || 'Loading...'} />
                ))}
                {recentEntries.length === 0 && (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-500 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-6 opacity-60">
                      <Archive className="w-8 h-8 text-white" />
                    </div>
                    {searchTerm.trim() ? (
                      <>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">No results found</h3>
                        <p className="text-gray-600 mb-1">No results found for &quot;{searchTerm}&quot;</p>
                        <p className="text-sm text-gray-500">Try different keywords or check your spelling</p>
                      </>
                    ) : selectedTags.length > 0 ? (
                      <>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">No entries with selected tags</h3>
                        <p className="text-gray-600 mb-1">No entries found with the tag{selectedTags.length > 1 ? 's' : ''}: {selectedTags.map(tag => `#${tag}`).join(', ')}</p>
                        <p className="text-sm text-gray-500">Try selecting different tags or add some memories with these tags</p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">No memories yet</h3>
                        <p className="text-gray-600 mb-1">No knowledge entries found.</p>
                        <p className="text-sm text-gray-500">Start by adding some information in the chat!</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Knowledge Card Component with search highlighting
function KnowledgeCard({ entry, searchQuery, userName }: { entry: KnowledgeEntry; searchQuery: string; userName: string }) {
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-gradient-to-r from-yellow-200 to-yellow-300 px-1 rounded-md text-yellow-900 font-medium">{part}</mark>
      ) : part
    );
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg shadow-blue-500/5 border border-white/20 p-6 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-gray-900 text-base leading-relaxed">
            {highlightText(entry.content, searchQuery)}
          </p>
        </div>
        <div className="ml-6 shrink-0">
          <div className="bg-gray-100/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-gray-200/50">
            <div className="flex items-center text-xs text-gray-600">
              <Clock className="w-3 h-3 mr-1" />
              {entry.createdAt.toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {entry.tags.map((tag, index) => (
            <span
              key={tag}
              className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-medium border transition-all duration-200 ${
                index % 3 === 0 
                  ? 'bg-gradient-to-r from-blue-50 to-blue-100/50 text-blue-700 border-blue-200/50' 
                  : index % 3 === 1
                  ? 'bg-gradient-to-r from-green-50 to-emerald-100/50 text-green-700 border-green-200/50'
                  : 'bg-gradient-to-r from-purple-50 to-violet-100/50 text-purple-700 border-purple-200/50'
              }`}
            >
              <Tag className="w-3 h-3 mr-1" />
              {highlightText(tag, searchQuery)}
            </span>
          ))}
        </div>
      )}
      
      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200/50">
        <div className="flex items-center text-xs text-gray-500">
          <User className="w-3 h-3 mr-1" />
          <span>Added by {userName}</span>
        </div>
        {entry.timestamp && (
          <div className="text-xs text-gray-400">
            ID: {entry.id?.slice(-8)}
          </div>
        )}
      </div>
    </div>
  );
} 