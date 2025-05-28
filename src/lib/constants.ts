// Knowledge categories for organizing information
export const KNOWLEDGE_CATEGORIES = [
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

export type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number];

// Knowledge entry interface
export interface KnowledgeEntry {
  id?: string;
  content: string;
  category: string;
  tags: string[];
  addedBy: string;
  createdAt: Date;
  updatedAt: Date;
  accountId: string; // Changed from coupleId to be more inclusive
} 