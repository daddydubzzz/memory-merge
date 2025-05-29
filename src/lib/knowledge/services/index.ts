// Services barrel export
// This provides a clean API for importing all knowledge services

// Account service
export * from './account-service';

// Space service  
export * from './space-service';

// Share link service
export * from './share-link-service';

// Utility service
export * from './utility-service';

// Phase 3: Knowledge service decomposition
export * from './knowledge-crud-service';
export * from './knowledge-search-service';
export * from './revision-service';
export * from './shopping-list-service';

// Unified service for backward compatibility
export { UnifiedKnowledgeService } from './unified-knowledge-service';

// Knowledge service will be added in a future phase
// export * from './knowledge-service'; 