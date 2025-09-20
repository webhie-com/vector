import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { MiddlewareManager } from '../src/middleware/manager';
import type { VectorRequest } from '../src/types';

describe('VectorRequest Properties', () => {
  let router: VectorRouter;
  let middlewareManager: MiddlewareManager;
  let authManager: AuthManager;
  let cacheManager: CacheManager;

  beforeEach(() => {
    middlewareManager = new MiddlewareManager();
    authManager = new AuthManager();
    cacheManager = new CacheManager();
    router = new VectorRouter(middlewareManager, authManager, cacheManager);
  });

  describe('Query Parameters', () => {
    it('should access query parameters in all possible ways', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      // Test various query string formats
      const testCases = [
        {
          url: 'http://localhost/test?page=1&limit=10',
          expected: { page: '1', limit: '10' },
          description: 'simple parameters'
        },
        {
          url: 'http://localhost/test?filter=name&filter=email',
          expectedArray: ['name', 'email'],
          key: 'filter',
          description: 'array parameters (same key multiple times)'
        },
        {
          url: 'http://localhost/test?search=hello%20world',
          expected: { search: 'hello world' },
          description: 'URL encoded parameters'
        },
        {
          url: 'http://localhost/test?empty=',
          expected: { empty: '' },
          description: 'empty parameter value'
        },
        {
          url: 'http://localhost/test',
          expected: {},
          description: 'no query parameters'
        }
      ];

      for (const testCase of testCases) {
        const request = new Request(testCase.url);
        await router.handle(request);

        expect(capturedRequest).not.toBeNull();

        if (testCase.expectedArray) {
          // Test array parameter access
          const value = capturedRequest!.query[testCase.key];
          expect(value).toEqual(testCase.expectedArray);
        } else {
          // Test object access patterns
          for (const [key, value] of Object.entries(testCase.expected)) {
            // Bracket notation
            expect(capturedRequest!.query[key]).toBe(value);

            // Check type is string | string[] | undefined
            const queryValue = capturedRequest!.query[key];
            expect(
              typeof queryValue === 'string' ||
              Array.isArray(queryValue) ||
              queryValue === undefined
            ).toBe(true);
          }
        }
      }
    });

    it('should handle query parameter edge cases', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      // Test special characters in query
      const request = new Request('http://localhost/test?special=%2B%3D%26&emoji=😀&chinese=你好');
      await router.handle(request);

      expect(capturedRequest!.query.special).toBe('+=&');
      expect(capturedRequest!.query.emoji).toBe('😀');
      expect(capturedRequest!.query.chinese).toBe('你好');
    });
  });

  describe('Headers', () => {
    it('should access headers in all possible ways', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const headers = new Headers({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value',
        'Accept': 'application/json, text/plain',
        'User-Agent': 'Test/1.0',
        'Cookie': 'session=abc; theme=dark'
      });

      const request = new Request('http://localhost/test', { headers });
      await router.handle(request);

      expect(capturedRequest).not.toBeNull();
      const req = capturedRequest!;

      // Test Headers methods
      expect(req.headers.get('Content-Type')).toBe('application/json');
      expect(req.headers.get('authorization')).toBe('Bearer token123'); // Case-insensitive
      expect(req.headers.get('X-Custom-Header')).toBe('custom-value');

      // Test has() method
      expect(req.headers.has('Authorization')).toBe(true);
      expect(req.headers.has('NonExistent')).toBe(false);

      // Test entries() iterator
      const headerEntries = Array.from(req.headers.entries());
      expect(headerEntries.length).toBeGreaterThan(0);

      // Test keys() iterator
      const headerKeys = Array.from(req.headers.keys());
      expect(headerKeys).toContain('content-type');
      expect(headerKeys).toContain('authorization');

      // Test values() iterator
      const headerValues = Array.from(req.headers.values());
      expect(headerValues).toContain('application/json');
      expect(headerValues).toContain('Bearer token123');

      // Test forEach
      let headerCount = 0;
      req.headers.forEach((value, key) => {
        headerCount++;
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
      });
      expect(headerCount).toBeGreaterThan(0);

      // Verify Headers is the correct type
      expect(req.headers instanceof Headers).toBe(true);
    });

    it('should handle missing headers gracefully', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/test');
      await router.handle(request);

      // Test getting non-existent headers
      expect(capturedRequest!.headers.get('NonExistent')).toBe(null);
      expect(capturedRequest!.headers.has('NonExistent')).toBe(false);
    });
  });

  describe('Cookies', () => {
    it('should access cookies in all possible ways', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const headers = new Headers({
        'Cookie': 'sessionId=abc123; theme=dark; language=en; preferences=compact'
      });

      const request = new Request('http://localhost/test', { headers });
      await router.handle(request);

      expect(capturedRequest).not.toBeNull();
      const req = capturedRequest!;

      // Test cookie access patterns
      expect(req.cookies?.sessionId).toBe('abc123');
      expect(req.cookies?.theme).toBe('dark');
      expect(req.cookies?.language).toBe('en');
      expect(req.cookies?.preferences).toBe('compact');

      // Test bracket notation
      expect(req.cookies?.['sessionId']).toBe('abc123');

      // Test Object methods
      if (req.cookies) {
        expect(Object.keys(req.cookies)).toContain('sessionId');
        expect(Object.keys(req.cookies)).toContain('theme');
        expect(Object.values(req.cookies)).toContain('abc123');
        expect(Object.values(req.cookies)).toContain('dark');

        // Test entries
        const cookieEntries = Object.entries(req.cookies);
        expect(cookieEntries.length).toBe(4);

        // Test in operator
        expect('sessionId' in req.cookies).toBe(true);
        expect('nonExistent' in req.cookies).toBe(false);
      }
    });

    it('should handle cookies with special characters', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const headers = new Headers({
        'Cookie': 'encoded=hello%20world; special=a=b; quoted="value"; empty='
      });

      const request = new Request('http://localhost/test', { headers });
      await router.handle(request);

      expect(capturedRequest!.cookies?.encoded).toBe('hello%20world');
      expect(capturedRequest!.cookies?.special).toBe('a=b');
      expect(capturedRequest!.cookies?.quoted).toBe('"value"');
      // The withCookies library doesn't handle empty values well
      expect(capturedRequest!.cookies?.empty).toBeUndefined();
    });

    it('should handle missing cookies gracefully', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/test');
      await router.handle(request);

      // Cookies should be an empty object when no Cookie header
      expect(capturedRequest!.cookies).toBeDefined();
      expect(Object.keys(capturedRequest!.cookies || {}).length).toBe(0);
      expect(capturedRequest!.cookies?.nonExistent).toBeUndefined();
    });
  });

  describe('URL Parameters', () => {
    it('should access URL parameters in all possible ways', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/users/:userId/posts/:postId', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/users/123/posts/456');
      await router.handle(request);

      expect(capturedRequest).not.toBeNull();
      const req = capturedRequest!;

      // Test dot notation
      expect(req.params?.userId).toBe('123');
      expect(req.params?.postId).toBe('456');

      // Test bracket notation
      expect(req.params?.['userId']).toBe('123');
      expect(req.params?.['postId']).toBe('456');

      // Test destructuring
      const { userId, postId } = req.params || {};
      expect(userId).toBe('123');
      expect(postId).toBe('456');

      // Test Object methods
      if (req.params) {
        expect(Object.keys(req.params)).toEqual(['userId', 'postId']);
        expect(Object.values(req.params)).toEqual(['123', '456']);
        expect(Object.entries(req.params)).toEqual([
          ['userId', '123'],
          ['postId', '456']
        ]);
      }
    });

    it('should handle greedy parameters', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/files/:path+', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/files/folder/subfolder/file.txt');
      await router.handle(request);

      expect(capturedRequest!.params?.path).toBe('folder/subfolder/file.txt');
    });
  });

  describe('Request Body (content)', () => {
    it('should access JSON content', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'POST', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const body = JSON.stringify({ name: 'John', age: 30, nested: { key: 'value' } });
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      await router.handle(request);

      expect(capturedRequest!.content).toEqual({
        name: 'John',
        age: 30,
        nested: { key: 'value' }
      });

      // Test accessing nested properties
      expect(capturedRequest!.content.name).toBe('John');
      expect(capturedRequest!.content.nested.key).toBe('value');
    });

    it('should access form data content', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'POST', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=Alice&email=alice@example.com&age=25'
      });

      await router.handle(request);

      expect(capturedRequest!.content).toEqual({
        name: 'Alice',
        email: 'alice@example.com',
        age: '25'
      });
    });

    it('should access plain text content', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'POST', path: '/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'Hello World'
      });

      await router.handle(request);

      expect(capturedRequest!.content).toBe('Hello World');
    });
  });

  describe('Other Request Properties', () => {
    it('should access all standard request properties', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'POST', path: '/api/test', expose: true },
        async (req: VectorRequest) => {
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/api/test?key=value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' })
      });

      await router.handle(request);

      const req = capturedRequest!;

      // Test method
      expect(req.method).toBe('POST');

      // Test URL
      expect(req.url).toBe('http://localhost/api/test?key=value');

      // Test route (the matched pattern)
      expect(req.route).toBeDefined();

      // Test context (should be initialized)
      expect(req.context).toBeDefined();
      expect(typeof req.context).toBe('object');

      // Test optional properties
      expect(req.authUser).toBeUndefined(); // No auth on this route
      expect(req.metadata).toBeUndefined(); // No metadata set

      // Verify property types
      expect(typeof req.method).toBe('string');
      expect(typeof req.url).toBe('string');
      expect(req.headers instanceof Headers).toBe(true);
      expect(typeof req.query).toBe('object');
      expect(typeof req.context).toBe('object');
    });

    it('should access startTime when set', async () => {
      let capturedRequest: VectorRequest | null = null;

      router.route(
        { method: 'GET', path: '/test', expose: true },
        async (req: VectorRequest) => {
          // Set startTime manually for testing
          req.startTime = Date.now();
          capturedRequest = req;
          return new Response('ok');
        }
      );

      const request = new Request('http://localhost/test');
      await router.handle(request);

      expect(capturedRequest!.startTime).toBeDefined();
      expect(typeof capturedRequest!.startTime).toBe('number');
      expect(capturedRequest!.startTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for all properties', () => {
      // This is a compile-time test - if it compiles, types are correct
      const testRequest: VectorRequest = {} as any;

      // These should all have correct types - using void to satisfy TypeScript
      void (testRequest.method satisfies string);
      void (testRequest.url satisfies string);
      void (testRequest.headers satisfies Headers);
      void (testRequest.query satisfies { [key: string]: string | string[] | undefined });
      void (testRequest.params satisfies Record<string, string> | undefined);
      void (testRequest.cookies satisfies Record<string, string> | undefined);
      void (testRequest.content satisfies any);
      void (testRequest.authUser satisfies any);
      void (testRequest.context satisfies Record<string, any>);
      void (testRequest.startTime satisfies number | undefined);

      // Test that properties exist
      expect(true).toBe(true); // Just need the test to run
    });
  });
});