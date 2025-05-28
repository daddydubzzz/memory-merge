// Common tag suggestions for consistency (users can add custom tags too)
export const SUGGESTED_TAGS = [
  // Home & Maintenance
  'home', 'maintenance', 'repair', 'appliances', 'utilities', 'wifi', 'router',
  
  // Health & Medical  
  'health', 'medical', 'doctor', 'appointment', 'insurance', 'medication', 'pharmacy',
  
  // Finance & Documents
  'finance', 'banking', 'insurance', 'taxes', 'documents', 'passwords', 'accounts',
  
  // Daily Life
  'shopping', 'groceries', 'restaurant', 'takeout', 'recipes', 'cooking',
  
  // Transportation
  'car', 'maintenance', 'insurance', 'registration', 'parking', 'gas', 'repair',
  
  // Personal & Family
  'birthday', 'anniversary', 'family', 'friends', 'contacts', 'emergency',
  
  // Work & Tasks
  'work', 'reminder', 'deadline', 'appointment', 'meeting', 'task',
  
  // Travel & Events  
  'travel', 'vacation', 'hotel', 'flight', 'event', 'tickets', 'reservation',
  
  // Storage & Organization
  'storage', 'location', 'attic', 'basement', 'garage', 'closet', 'holiday'
] as const;

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

export type LegacyKnowledgeCategory = typeof LEGACY_CATEGORIES[number];

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