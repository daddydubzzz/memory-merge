import type { KnowledgeEntry } from '../types';
import { KnowledgeCRUDService } from './knowledge-crud-service';
import { KnowledgeSearchService } from './knowledge-search-service';
import { RevisionService } from './revision-service';
import { ShoppingListService } from './shopping-list-service';

/**
 * Unified Knowledge Service
 * Orchestrates all the decomposed knowledge services while maintaining backward compatibility
 * This replaces the original monolithic KnowledgeService class
 */
export class UnifiedKnowledgeService {
  private accountId: string;
  private crudService: KnowledgeCRUDService;
  private searchService: KnowledgeSearchService;
  private revisionService: RevisionService;
  private shoppingService: ShoppingListService;

  constructor(accountId: string) {
    this.accountId = accountId;
    this.crudService = new KnowledgeCRUDService(accountId);
    this.searchService = new KnowledgeSearchService(accountId);
    this.revisionService = new RevisionService(accountId);
    this.shoppingService = new ShoppingListService(accountId);
  }

  // Core CRUD operations
  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>): Promise<string> {
    // Handle revision logic for updates using revision service
    if (entry.intent === 'update' && entry.replaces) {
      console.log('🔄 Processing update - calling handleMemoryReplacement');
      await this.revisionService.handleMemoryReplacement(
        entry.replaces, 
        entry.timestamp || new Date().toISOString(),
        this.updateKnowledge.bind(this)
      );
    }

    return this.crudService.addKnowledge(entry);
  }

  async updateKnowledge(id: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'accountId'>>): Promise<void> {
    return this.crudService.updateKnowledge(id, updates);
  }

  async deleteKnowledge(id: string): Promise<void> {
    return this.crudService.deleteKnowledge(id);
  }

  async getCurrentMemories(tag: string): Promise<KnowledgeEntry[]> {
    return this.crudService.getCurrentMemories(tag);
  }

  async getKnowledgeByTags(tags: string[], includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    return this.crudService.getKnowledgeByTags(tags, includeSuperseded);
  }

  subscribeToKnowledge(callback: (entries: KnowledgeEntry[]) => void) {
    return this.crudService.subscribeToKnowledge(callback);
  }

  // Search operations
  async searchKnowledge(searchTerms: string[], tags?: string[], includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    return this.searchService.searchKnowledge(searchTerms, tags, includeSuperseded);
  }

  async getRecentKnowledge(limitCount: number = 10, includeSuperseded: boolean = false): Promise<KnowledgeEntry[]> {
    return this.searchService.getRecentKnowledge(limitCount, includeSuperseded);
  }

  // Shopping list operations
  async getActiveShoppingList(): Promise<KnowledgeEntry[]> {
    return this.shoppingService.getActiveShoppingList();
  }

  async handleItemPurchase(purchasedItems: string[], tags: string[]): Promise<void> {
    return this.shoppingService.handleItemPurchase(
      purchasedItems, 
      tags, 
      this.addKnowledge.bind(this), 
      this.updateKnowledge.bind(this)
    );
  }

  async clearShoppingList(listType: string): Promise<void> {
    return this.shoppingService.clearShoppingList(
      listType, 
      this.addKnowledge.bind(this), 
      this.updateKnowledge.bind(this)
    );
  }

  // Revision operations
  async getRevisionHistory(identifier: string): Promise<KnowledgeEntry[]> {
    return this.revisionService.getRevisionHistory(identifier);
  }

  async getCurrentVersion(tag: string): Promise<KnowledgeEntry[]> {
    return this.revisionService.getCurrentVersion(tag);
  }

  isSuperseded(entry: KnowledgeEntry): boolean {
    return this.revisionService.isSuperseded(entry);
  }

  // Direct access to services for advanced use cases
  get crud() {
    return this.crudService;
  }

  get search() {
    return this.searchService;
  }

  get revision() {
    return this.revisionService;
  }

  get shopping() {
    return this.shoppingService;
  }
} 