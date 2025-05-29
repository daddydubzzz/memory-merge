// Re-export account management functions
export { 
  createAccount,
  getAccountByMember,
  joinAccount
} from './knowledge/services/account-service';

// Re-export space management functions
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
} from './knowledge/services/space-service';

// Re-export share link management functions
export {
  createShareLink,
  getShareLinkByToken,
  validateShareLink,
  joinSpaceByShareLink,
  getSpaceShareLinks,
  deactivateShareLink
} from './knowledge/services/share-link-service';

// Re-export utility functions
export {
  getTagStats,
  getUserDisplayName
} from './knowledge/services/utility-service';

// Phase 3: Export the new unified service as KnowledgeService for backward compatibility
export { UnifiedKnowledgeService as KnowledgeService } from './knowledge/services/unified-knowledge-service';

// Re-export types for backward compatibility during refactoring
export type { 
  Account, 
  Space, 
  UserProfile, 
  ShareLink,
  KnowledgeEntry 
} from './knowledge/types'; 