import { DEFAULT_CONFIG } from '../constants';
import type { CacheHandler, DefaultVectorTypes, GetCacheType, VectorTypes } from '../types';

interface CacheEntry<T = any> {
  value: T;
  expires: number;
}

export class CacheManager<TTypes extends VectorTypes = DefaultVectorTypes> {
  private cacheHandler: CacheHandler | null = null;
  private memoryCache: Map<string, CacheEntry> = new Map();
  private cleanupInterval: Timer | null = null;

  setCacheHandler(handler: CacheHandler) {
    this.cacheHandler = handler;
  }

  async get<T = GetCacheType<TTypes>>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = DEFAULT_CONFIG.CACHE_TTL
  ): Promise<T> {
    if (ttl <= 0) {
      return factory();
    }

    if (this.cacheHandler) {
      return this.cacheHandler(key, factory, ttl) as Promise<T>;
    }

    return this.getFromMemoryCache(key, factory, ttl);
  }

  private async getFromMemoryCache<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const now = Date.now();
    const cached = this.memoryCache.get(key);

    if (this.isCacheValid(cached, now)) {
      return cached!.value as T;
    }

    const value = await factory();
    this.setInMemoryCache(key, value, ttl);

    return value;
  }

  private isCacheValid(entry: CacheEntry | undefined, now: number): boolean {
    return entry !== undefined && entry.expires > now;
  }

  private setInMemoryCache(key: string, value: any, ttl: number): void {
    const expires = Date.now() + ttl * 1000;
    this.memoryCache.set(key, { value, expires });

    this.scheduleCleanup();
  }

  private scheduleCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Clean up every minute
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires <= now) {
        this.memoryCache.delete(key);
      }
    }

    if (this.memoryCache.size === 0 && this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  clear(): void {
    this.memoryCache.clear();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async set<T = GetCacheType<TTypes>>(
    key: string,
    value: T,
    ttl: number = DEFAULT_CONFIG.CACHE_TTL
  ): Promise<void> {
    if (ttl <= 0) {
      return;
    }

    if (this.cacheHandler) {
      // Custom cache handler can implement its own set logic
      await this.cacheHandler(key, async () => value, ttl);
      return;
    }

    this.setInMemoryCache(key, value, ttl);
  }

  delete(key: string): boolean {
    return this.memoryCache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.memoryCache.get(key);
    if (!entry) return false;

    if (entry.expires <= Date.now()) {
      this.memoryCache.delete(key);
      return false;
    }

    return true;
  }

  generateKey(request: Request, options?: { authUser?: any }): string {
    const url = new URL(request.url);
    const parts = [request.method, url.pathname, url.search, options?.authUser?.id || 'anonymous'];

    return parts.join(':');
  }
}
