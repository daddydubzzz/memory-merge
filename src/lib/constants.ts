// Knowledge categories for organizing information
export const KNOWLEDGE_CATEGORIES = [
  'Home Maintenance',
  'Documents', 
  'Schedules',
  'Shopping',
  'Travel',
  'Personal',
  'Household',
  'Finance',
  'Health',
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
  coupleId: string;
} 