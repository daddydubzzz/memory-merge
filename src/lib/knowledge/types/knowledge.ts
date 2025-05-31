// Import temporal types from our new temporal processor
import type { TemporalInfo } from '../../temporal-processor';

// Updated knowledge entry interface (tags-based) with revision and shopping support and user context and temporal intelligence
export interface KnowledgeEntry {
  id?: string;
  content: string;
  enhanced_content?: string;  // Enhanced content with user context used for embedding
  processed_content?: string; // Content enhanced with temporal resolution for better AI understanding
  tags: string[]; // Primary organization method
  addedBy: string;
  addedByName?: string;       // Cached display name for quick access
  createdAt: Date;
  updatedAt: Date;
  accountId: string;
  // New revision tracking fields
  timestamp?: string;          // ISO 8601 string (e.g., "2025-05-28T14:03:00Z")
  replaces?: string;          // (Optional) Tag or ID of memory being replaced
  replaced_by?: string;       // (Optional) Timestamp or ID of memory that superseded this one
  intent?: "create" | "update" | "delete" | "purchase" | "clear_list";  // Defaults to "create" if not specified
  // New shopping list fields
  items?: string[];           // Individual items for shopping lists
  listType?: string;          // e.g., "shopping", "grocery", "todo"
  // New temporal intelligence fields
  temporalInfo?: TemporalInfo[];         // Parsed temporal expressions and their metadata
  resolvedDates?: Date[];                // Array of all resolved absolute dates
  temporalRelevanceScore?: number;       // 0-1 score for current temporal relevance
  containsTemporalRefs?: boolean;        // Quick flag for temporal content
}

// Enhanced vector search result interface with temporal information
export interface VectorSearchResult extends KnowledgeEntry {
  similarity: number;
  temporalContext?: string;              // Human-readable temporal context for AI responses
  isTemporallyRelevant?: boolean;        // Whether this result is temporally relevant now
  nextOccurrence?: Date;                 // For recurring events, when is the next occurrence
}

// Temporal search options for intelligent filtering
export interface TemporalSearchOptions {
  timeFrame?: 'future' | 'past' | 'current' | 'all';
  temporalRelevanceWeight?: number;      // 0-1, how much to weight temporal relevance vs semantic similarity
  includeExpiredEvents?: boolean;        // Whether to include past events in results
  includeRecurringEvents?: boolean;      // Whether to include recurring events
  temporalRelevanceThreshold?: number;   // Minimum temporal relevance score to include
}

// Enhanced query processing with temporal awareness
export interface TemporalQuery {
  originalQuery: string;
  processedQuery: string;               // Query enhanced with temporal context
  temporalIntent: 'future' | 'past' | 'current' | 'general';
  temporalExpressions: string[];        // Temporal expressions found in the query
  searchOptions: TemporalSearchOptions;
}

// Legacy categories (for migration purposes)
export const LEGACY_CATEGORIES = [
  'Tasks & Reminders',
  'Home Maintenance', 
  'Documents',
  'Schedules & Events',
  'Shopping',
  'Travel',
  'Personal Notes',
  'Household Items',
  'Finance',
  'Health & Medical',
  'Contacts',
  'Passwords & Accounts',
  'Other'
] as const;

export type LegacyKnowledgeCategory = typeof LEGACY_CATEGORIES[number];

// Category to tags mapping for migration
export const CATEGORY_TO_TAGS_MAP: Record<string, string[]> = {
  'Tasks & Reminders': ['task', 'reminder'],
  'Home Maintenance': ['home', 'maintenance'],
  'Documents': ['documents'],
  'Schedules & Events': ['schedule', 'event'],
  'Shopping': ['shopping'],
  'Travel': ['travel'],
  'Personal Notes': ['personal', 'notes'],
  'Household Items': ['household', 'items'],
  'Finance': ['finance'],
  'Health & Medical': ['health', 'medical'],
  'Contacts': ['contacts'],
  'Passwords & Accounts': ['passwords', 'accounts'],
  'Other': ['misc']
}; 