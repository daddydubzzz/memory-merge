// Updated knowledge entry interface (tags-based) with revision and shopping support
export interface KnowledgeEntry {
  id?: string;
  content: string;
  tags: string[]; // Primary organization method
  addedBy: string;
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