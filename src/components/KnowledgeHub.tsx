'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Tag, Clock, User } from 'lucide-react';
import { KnowledgeService } from '@/lib/knowledge';
import type { KnowledgeEntry } from '@/lib/constants';

interface KnowledgeHubProps {
  accountId: string;
}

export default function KnowledgeHub({ accountId }: KnowledgeHubProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recentEntries, setRecentEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const knowledgeService = useMemo(() => new KnowledgeService(accountId), [accountId]);

  const loadRecentEntries = useCallback(async () => {
    try {
      const entries = await knowledgeService.getRecentKnowledge(20);
      setRecentEntries(entries);
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setLoading(false);
    }
  }, [knowledgeService]);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      // If no search query, load recent entries
      loadRecentEntries();
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await knowledgeService.searchKnowledge(
        [query],
        selectedTags.length > 0 ? selectedTags : undefined
      );
      setRecentEntries(results);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  }, [knowledgeService, selectedTags, loadRecentEntries]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch]);

  useEffect(() => {
    loadRecentEntries();
  }, [loadRecentEntries]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search your knowledge... (type to search instantly)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {(isSearching || (searchQuery && loading)) && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="flex space-x-4 text-sm text-gray-600">
          <span>
            {searchQuery.trim() ? `${recentEntries.length} search results` : `${recentEntries.length} entries`}
          </span>
          <span>•</span>
          <span>Last updated {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Knowledge Entries */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading knowledge...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentEntries.map((entry) => (
              <KnowledgeCard key={entry.id} entry={entry} searchQuery={searchQuery} />
            ))}
            {recentEntries.length === 0 && (
              <div className="text-center py-8">
                {searchQuery.trim() ? (
                  <>
                    <p className="text-gray-600">No results found for "{searchQuery}"</p>
                    <p className="text-sm text-gray-500 mt-1">Try different keywords or check your spelling</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-600">No knowledge entries found.</p>
                    <p className="text-sm text-gray-500 mt-1">Start by adding some information in the chat!</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Knowledge Card Component with search highlighting
function KnowledgeCard({ entry, searchQuery }: { entry: KnowledgeEntry; searchQuery: string }) {
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">{part}</mark>
      ) : part
    );
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-gray-900 text-sm">
            {highlightText(entry.content, searchQuery)}
          </p>
        </div>
        <div className="ml-4 text-xs text-gray-500">
          <Clock className="w-3 h-3 inline mr-1" />
          {entry.createdAt.toLocaleDateString()}
        </div>
      </div>
      
      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-2">
        {entry.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
          >
            <Tag className="w-3 h-3 mr-1" />
            {highlightText(tag, searchQuery)}
          </span>
        ))}
      </div>
      
      {/* Added by */}
      <div className="flex items-center text-xs text-gray-500">
        <User className="w-3 h-3 mr-1" />
        Added by member
      </div>
    </div>
  );
} 