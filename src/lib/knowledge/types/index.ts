// Re-export all knowledge-related types
export type { Account, Space, SpaceSettings, UserProfile } from './account';
export type { ShareLink } from './share-links';
export type { 
  KnowledgeEntry, 
  LegacyKnowledgeCategory 
} from './knowledge';

// Re-export constants that other files might need
export { 
  LEGACY_CATEGORIES, 
  CATEGORY_TO_TAGS_MAP 
} from './knowledge'; 