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

// Phase 3: Export the new unified service as KnowledgeService for backward compatibility
export { UnifiedKnowledgeService as KnowledgeService } from './services/unified-knowledge-service';

// Export individual services for advanced usage
export {
  KnowledgeCRUDService,
  KnowledgeSearchService,
  RevisionService,
  ShoppingListService
} from './services';

// Account management functions - now from account-service
export { 
  createAccount,
  getAccountByMember,
  joinAccount
} from './services/account-service';

// Space management functions - now from space-service
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
} from './services/space-service';

// Share link management functions - now from share-link-service
export {
  createShareLink,
  getShareLinkByToken,
  validateShareLink,
  joinSpaceByShareLink,
  getSpaceShareLinks,
  deactivateShareLink
} from './services/share-link-service';

// Utility functions - now from utility-service
export {
  getTagStats,
  getUserDisplayName
} from './services/utility-service'; 