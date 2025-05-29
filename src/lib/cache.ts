// Simple client-side cache with TTL support
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time to live in milliseconds
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMinutes: number = 5): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const cache = new SimpleCache();

// Cache key generators
export const cacheKeys = {
  tagStats: (accountId: string) => `tagStats:${accountId}`,
  recentEntries: (accountId: string, limit: number) => `recentEntries:${accountId}:${limit}`,
  searchResults: (accountId: string, query: string, tags?: string[]) => 
    `search:${accountId}:${query}:${tags?.join(',') || 'no-tags'}`,
}; 