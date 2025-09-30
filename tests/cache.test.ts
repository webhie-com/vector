import { beforeEach, describe, expect, it } from 'bun:test';
import { CacheManager } from '../src/cache/manager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  describe('Memory Cache Operations', () => {
    it('should cache and retrieve values', async () => {
      const key = 'test-key';
      const value = { data: 'test' };

      await cacheManager.set(key, value, 60);

      const retrieved = await cacheManager.get(key, async () => ({ data: 'new' }), 60);

      expect(retrieved).toEqual(value);
    });

    it('should call factory function when cache misses', async () => {
      let factoryCalled = false;
      const value = { data: 'fresh' };

      const result = await cacheManager.get(
        'missing-key',
        async () => {
          factoryCalled = true;
          return value;
        },
        60
      );

      expect(factoryCalled).toBe(true);
      expect(result).toEqual(value);
    });

    it('should respect TTL', async () => {
      const key = 'ttl-test';
      const value = { data: 'expires' };

      // Set with very short TTL (0.1 seconds)
      await cacheManager.set(key, value, 0.1);

      // Should exist immediately
      expect(cacheManager.has(key)).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(cacheManager.has(key)).toBe(false);
    });

    it('should delete cache entries', async () => {
      const key = 'delete-test';
      await cacheManager.set(key, { data: 'delete me' }, 60);

      expect(cacheManager.has(key)).toBe(true);

      const deleted = cacheManager.delete(key);
      expect(deleted).toBe(true);
      expect(cacheManager.has(key)).toBe(false);
    });

    it('should skip caching with TTL <= 0', async () => {
      const key = 'no-cache';
      const value = { data: 'not cached' };

      await cacheManager.set(key, value, 0);
      expect(cacheManager.has(key)).toBe(false);

      await cacheManager.set(key, value, -1);
      expect(cacheManager.has(key)).toBe(false);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent keys for same request', () => {
      const request = new Request('http://localhost/api/test?page=1', {
        method: 'GET',
      });

      const key1 = cacheManager.generateKey(request);
      const key2 = cacheManager.generateKey(request);

      expect(key1).toBe(key2);
    });

    it('should include method in cache key', () => {
      const getRequest = new Request('http://localhost/api/test', {
        method: 'GET',
      });
      const postRequest = new Request('http://localhost/api/test', {
        method: 'POST',
      });

      const getKey = cacheManager.generateKey(getRequest);
      const postKey = cacheManager.generateKey(postRequest);

      expect(getKey).not.toBe(postKey);
      expect(getKey).toContain('GET');
      expect(postKey).toContain('POST');
    });

    it('should include query params in cache key', () => {
      const request1 = new Request('http://localhost/api/test?page=1');
      const request2 = new Request('http://localhost/api/test?page=2');

      const key1 = cacheManager.generateKey(request1);
      const key2 = cacheManager.generateKey(request2);

      expect(key1).not.toBe(key2);
    });

    it('should include auth user ID when provided', () => {
      const request = new Request('http://localhost/api/test');

      const keyAnonymous = cacheManager.generateKey(request);
      const keyWithUser = cacheManager.generateKey(request, {
        authUser: { id: 'user-123' },
      });

      expect(keyAnonymous).toContain('anonymous');
      expect(keyWithUser).toContain('user-123');
      expect(keyAnonymous).not.toBe(keyWithUser);
    });
  });

  describe('Custom Cache Handler', () => {
    it('should use custom cache handler when set', async () => {
      let customHandlerCalled = false;
      const customValue = { custom: true };

      cacheManager.setCacheHandler(async (_key, _factory, _ttl) => {
        customHandlerCalled = true;
        return customValue;
      });

      const result = await cacheManager.get('test', async () => ({ default: true }), 60);

      expect(customHandlerCalled).toBe(true);
      expect(result).toEqual(customValue);
    });
  });

  describe('Typed Cache Operations', () => {
    interface TypedCacheValue {
      version: number;
      data: string;
    }

    it('should handle typed values', async () => {
      const typedCache = new CacheManager<{ cache: TypedCacheValue }>();

      const value: TypedCacheValue = {
        version: 1,
        data: 'typed content',
      };

      await typedCache.set('typed-key', value, 60);

      const retrieved = await typedCache.get<TypedCacheValue>(
        'typed-key',
        async () => ({ version: 2, data: 'new' }),
        60
      );

      expect(retrieved.version).toBe(1);
      expect(retrieved.data).toBe('typed content');
    });
  });
});
