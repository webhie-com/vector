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

      // Wait for expiration — use a generous margin so this is reliable under CI load
      await new Promise((resolve) => setTimeout(resolve, 500));

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

  describe('Cache Stampede Prevention (Bug A1)', () => {
    it('should call factory exactly once for concurrent requests on the same key', async () => {
      let factoryCallCount = 0;
      const factory = async () => {
        factoryCallCount++;
        // Simulate async work so concurrent calls overlap
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { data: 'result' };
      };

      // Fire two concurrent requests for the same uncached key
      const [result1, result2] = await Promise.all([
        cacheManager.get('concurrent-key', factory, 60),
        cacheManager.get('concurrent-key', factory, 60),
      ]);

      expect(factoryCallCount).toBe(1);
      expect(result1).toEqual({ data: 'result' });
      expect(result2).toEqual({ data: 'result' });
    });

    it('should handle three concurrent requests with factory called exactly once', async () => {
      let factoryCallCount = 0;
      const factory = async () => {
        factoryCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'value';
      };

      const results = await Promise.all([
        cacheManager.get('triple-concurrent', factory, 60),
        cacheManager.get('triple-concurrent', factory, 60),
        cacheManager.get('triple-concurrent', factory, 60),
      ]);

      expect(factoryCallCount).toBe(1);
      expect(results).toEqual(['value', 'value', 'value']);
    });
  });

  describe('Falsy User ID Cache Key Collision (Bug A2)', () => {
    it('should NOT collide when authUser.id is numeric zero', () => {
      const request = new Request('http://localhost/api/test');

      const keyAnonymous = cacheManager.generateKey(request);
      const keyWithZeroId = cacheManager.generateKey(request, {
        authUser: { id: 0 },
      });

      expect(keyAnonymous).toContain('anonymous');
      expect(keyWithZeroId).not.toContain('anonymous');
      expect(keyWithZeroId).toContain('0');
      expect(keyAnonymous).not.toBe(keyWithZeroId);
    });

    it('should NOT collide when authUser.id is empty string', () => {
      const request = new Request('http://localhost/api/test');

      const keyAnonymous = cacheManager.generateKey(request);
      const keyWithEmptyId = cacheManager.generateKey(request, {
        authUser: { id: '' },
      });

      // Empty string is a valid (if unusual) user ID — must not map to 'anonymous'
      expect(keyAnonymous).not.toBe(keyWithEmptyId);
    });

    it('should still use anonymous when authUser is not provided', () => {
      const request = new Request('http://localhost/api/test');
      const key = cacheManager.generateKey(request);
      expect(key).toContain('anonymous');
    });

    it('should still use anonymous when authUser.id is null', () => {
      const request = new Request('http://localhost/api/test');
      const key = cacheManager.generateKey(request, { authUser: { id: null } });
      expect(key).toContain('anonymous');
    });

    it('should still use anonymous when authUser.id is undefined', () => {
      const request = new Request('http://localhost/api/test');
      const key = cacheManager.generateKey(request, { authUser: { id: undefined } });
      expect(key).toContain('anonymous');
    });
  });

  describe('clear() stops interval (Bug A3)', () => {
    it('should empty the cache when clear() is called', async () => {
      await cacheManager.set('key-1', 'value-1', 60);
      await cacheManager.set('key-2', 'value-2', 60);

      expect(cacheManager.has('key-1')).toBe(true);
      expect(cacheManager.has('key-2')).toBe(true);

      cacheManager.clear();

      expect(cacheManager.has('key-1')).toBe(false);
      expect(cacheManager.has('key-2')).toBe(false);
    });

    it('should stop the cleanup interval when clear() is called', async () => {
      // Set an item to start the interval
      await cacheManager.set('interval-key', 'interval-value', 60);

      // Access the private cleanupInterval via type cast to verify it started
      const managerAsAny = cacheManager as any;
      expect(managerAsAny.cleanupInterval).not.toBeNull();

      cacheManager.clear();

      // After clear(), the interval should be stopped and nulled out
      expect(managerAsAny.cleanupInterval).toBeNull();
    });

    it('should allow re-use after clear() without issues', async () => {
      await cacheManager.set('before-clear', 'value', 60);
      cacheManager.clear();

      // Should be able to set and retrieve a new value after clear
      await cacheManager.set('after-clear', 'new-value', 60);
      const result = await cacheManager.get('after-clear', async () => 'factory', 60);
      expect(result).toBe('new-value');
    });

    it('unrefs cleanup interval so cache timers do not pin the event loop', async () => {
      const originalSetInterval = globalThis.setInterval;
      let unrefCalled = false;

      try {
        (globalThis as any).setInterval = (_handler: TimerHandler, _timeout?: number, ..._args: any[]) => {
          return {
            unref: () => {
              unrefCalled = true;
            },
          } as any;
        };

        const manager = new CacheManager();
        await manager.set('unref-key', 'value', 60);

        expect(unrefCalled).toBe(true);
      } finally {
        (globalThis as any).setInterval = originalSetInterval;
      }
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
