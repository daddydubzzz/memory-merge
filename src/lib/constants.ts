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

// Re-export knowledge-related types and constants from the new knowledge module
export type { 
  KnowledgeEntry, 
  LegacyKnowledgeCategory 
} from './knowledge/types';

export { 
  LEGACY_CATEGORIES, 
  CATEGORY_TO_TAGS_MAP 
} from './knowledge/types'; 