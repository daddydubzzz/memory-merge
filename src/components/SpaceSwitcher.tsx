'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Users, Brain, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getUserSpaces, 
  getUserProfile, 
  updateActiveSpace, 
  getSpaceById,
  type Space 
} from '@/lib/knowledge';

interface SpaceSwitcherProps {
  currentSpaceId: string | null;
  onSpaceChange: (spaceId: string) => void;
  onCreateSpace: () => void;
  onJoinSpace?: () => void;
}

export default function SpaceSwitcher({ currentSpaceId, onSpaceChange, onCreateSpace, onJoinSpace }: SpaceSwitcherProps) {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load user's spaces
  useEffect(() => {
    if (!user) return;

    const loadSpaces = async () => {
      setLoading(true);
      try {
        const userSpaces = await getUserSpaces(user.uid);
        setSpaces(userSpaces);

        // Find current space
        if (currentSpaceId) {
          const space = userSpaces.find(s => s.id === currentSpaceId);
          if (space) {
            setCurrentSpace(space);
          } else {
            // Fallback: load space by ID if not in user's spaces
            const space = await getSpaceById(currentSpaceId);
            setCurrentSpace(space);
          }
        }
      } catch (error) {
        console.error('Error loading spaces:', error);
      }
      setLoading(false);
    };

    loadSpaces();
  }, [user, currentSpaceId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSpaceSelect = async (space: Space) => {
    if (!user || !space.id) return;

    setCurrentSpace(space);
    setIsOpen(false);
    onSpaceChange(space.id);

    // Update user's active space preference
    try {
      await updateActiveSpace(user.uid, space.id);
    } catch (error) {
      console.error('Error updating active space:', error);
    }
  };

  const getSpaceIcon = (space: Space) => {
    if (space.type === 'personal') {
      return <Brain className="w-4 h-4" />;
    }
    return space.icon || '👥';
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

  if (loading) {
    return (
      <div className="flex items-center space-x-3 p-3 bg-white/10 rounded-xl border border-white/20">
        <div className="w-8 h-8 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg animate-pulse"></div>
        <div className="flex-1">
          <div className="h-4 bg-white/20 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Space Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 hover:border-white/30 transition-all duration-200 group"
      >
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 bg-gradient-to-r ${currentSpace ? getSpaceColor(currentSpace) : 'from-gray-500 to-gray-600'} rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
            {currentSpace ? (
              typeof getSpaceIcon(currentSpace) === 'string' ? (
                getSpaceIcon(currentSpace)
              ) : (
                getSpaceIcon(currentSpace)
              )
            ) : (
              '?'
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white group-hover:text-white/90">
              {currentSpace?.name || 'Select Space'}
            </p>
            <p className="text-xs text-gray-300">
              {currentSpace?.type === 'personal' ? 'Personal' : `${currentSpace?.members.length || 0} members`}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-2xl shadow-black/10 z-50 overflow-hidden">
          {/* Spaces List */}
          <div className="max-h-64 overflow-y-auto">
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => handleSpaceSelect(space)}
                className={`w-full flex items-center space-x-3 p-4 hover:bg-gray-50/80 transition-all duration-200 group ${
                  currentSpace?.id === space.id ? 'bg-blue-50/80 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className={`w-8 h-8 bg-gradient-to-r ${getSpaceColor(space)} rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
                  {typeof getSpaceIcon(space) === 'string' ? (
                    getSpaceIcon(space)
                  ) : (
                    getSpaceIcon(space)
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">
                    {space.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {space.type === 'personal' ? 'Personal space' : `${space.members.length} members`}
                  </p>
                </div>
                {space.type === 'shared' && (
                  <Users className="w-4 h-4 text-gray-400" />
                )}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200/50 bg-gray-50/50">
            <button
              onClick={() => {
                setIsOpen(false);
                onCreateSpace();
              }}
              className="w-full flex items-center space-x-3 p-4 hover:bg-gray-100/80 transition-all duration-200 group"
            >
              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                <Plus className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">
                  Create New Space
                </p>
                <p className="text-xs text-gray-500">
                  Start a new shared knowledge space
                </p>
              </div>
            </button>
            
            {onJoinSpace && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onJoinSpace();
                }}
                className="w-full flex items-center space-x-3 p-4 hover:bg-gray-100/80 transition-all duration-200 group border-t border-gray-200/30"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">
                    Join Space
                  </p>
                  <p className="text-xs text-gray-500">
                    Enter an invite code to join
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 