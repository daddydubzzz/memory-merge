// Main barrel export for the knowledge module
// This provides a clean API for importing knowledge functionality

// Export all types
export type { 
  Account, 
  Space, 
  UserProfile, 
  ShareLink,
  KnowledgeEntry,
  LegacyKnowledgeCategory 
} from './types';

export { 
  LEGACY_CATEGORIES, 
  CATEGORY_TO_TAGS_MAP 
} from './types';

// For now, all services are still in the main knowledge.ts file
// These will be moved in subsequent phases
export { KnowledgeService } from '../knowledge';

// Account management functions
export { 
  createAccount,
  getAccountByMember,
  joinAccount
} from '../knowledge';

// Space management functions
export {
  createPersonalSpace,
  createSharedSpace,
  createOrUpdateUserProfile,
  addSpaceToUserProfile,
  getUserSpaces,
  getUserProfile,
  updateActiveSpace,
  getSpaceById,
  cleanupDuplicatePersonalSpaces
} from '../knowledge';

// Share link management functions
export {
  createShareLink,
  getShareLinkByToken,
  validateShareLink,
  joinSpaceByShareLink,
  getSpaceShareLinks,
  deactivateShareLink
} from '../knowledge';

// Utility functions
export {
  getTagStats,
  getUserDisplayName
} from '../knowledge'; 