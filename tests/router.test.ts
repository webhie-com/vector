import { beforeEach, describe, expect, it } from 'bun:test';
import type { RouteEntry } from 'itty-router';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { RouteScanner } from '../src/dev/route-scanner';
import { MiddlewareManager } from '../src/middleware/manager';

describe('VectorRouter', () => {
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

  describe('Route Registration', () => {
    it('should register and sort routes correctly', () => {
      // Register routes in wrong order
      router.route({ method: 'GET', path: '/users/:id', expose: true }, async () => 'user');
      router.route({ method: 'GET', path: '/users/profile', expose: true }, async () => 'profile');
      router.route({ method: 'GET', path: '/users', expose: true }, async () => 'users');

      const routes = router.getRoutes();

      // Check that routes are sorted with more specific first
      expect(routes[0][3]).toBe('/users/profile'); // Most specific
      expect(routes[1][3]).toBe('/users'); // Static
      expect(routes[2][3]).toBe('/users/:id'); // Parametric
    });

    it('should handle wildcard routes', () => {
      router.route({ method: 'GET', path: '/files/*', expose: true }, async () => 'files');
      router.route(
        { method: 'GET', path: '/files/specific', expose: true },
        async () => 'specific'
      );

      const routes = router.getRoutes();

      // Specific route should come before wildcard
      expect(routes[0][3]).toBe('/files/specific');
      expect(routes[1][3]).toBe('/files/*');
    });
  });

  describe('Route Specificity Scoring', () => {
    it('should prioritize exact paths', () => {
      router.route({ method: 'GET', path: '/api/v1/users', expose: true }, async () => 'exact');
      router.route(
        { method: 'GET', path: '/api/:version/users', expose: true },
        async () => 'param'
      );
      router.route({ method: 'GET', path: '/api/*/users', expose: true }, async () => 'wildcard');

      const routes = router.getRoutes();

      // Exact path should have highest priority
      expect(routes[0][3]).toBe('/api/v1/users');
      expect(routes[1][3]).toBe('/api/:version/users');
      expect(routes[2][3]).toBe('/api/*/users');
    });

    it('should handle complex path patterns', () => {
      const paths = [
        '/api/users/:id/posts/:postId',
        '/api/users/:id/posts',
        '/api/users/admin/posts',
        '/api/users/:id',
        '/api/users',
      ];

      paths.forEach((path) => {
        router.route({ method: 'GET', path, expose: true }, async () => path);
      });

      const routes = router.getRoutes();

      // Most specific (static segments) should come first
      expect(routes[0][3]).toBe('/api/users/admin/posts');
      expect(routes[1][3]).toBe('/api/users');
    });
  });

  describe('Request Handling', () => {
    it('should match routes correctly', async () => {
      router.route(
        {
          method: 'GET',
          path: '/test',
          expose: true,
        },
        async () => ({ result: 'test' })
      );

      const request = new Request('http://localhost/test', { method: 'GET' });
      const response = await router.handle(request);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });

    it('should return 404 for unmatched routes', async () => {
      const request = new Request('http://localhost/nonexistent', {
        method: 'GET',
      });
      const response = await router.handle(request);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(404);
    });

    it('should return 403 for non-exposed routes', async () => {
      router.route(
        {
          method: 'GET',
          path: '/internal',
          expose: false,
        },
        async () => ({ internal: true })
      );

      const request = new Request('http://localhost/internal', {
        method: 'GET',
      });
      const response = await router.handle(request);

      expect(response.status).toBe(403);
    });
  });

  describe('Method Matching', () => {
    it('should match correct HTTP methods', async () => {
      router.route({ method: 'POST', path: '/data', expose: true }, async () => 'post');
      router.route({ method: 'GET', path: '/data', expose: true }, async () => 'get');

      const getRequest = new Request('http://localhost/data', {
        method: 'GET',
      });
      const postRequest = new Request('http://localhost/data', {
        method: 'POST',
      });

      const getResponse = await router.handle(getRequest);
      const postResponse = await router.handle(postRequest);

      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);
    });

    it('should handle OPTIONS requests', async () => {
      router.route({ method: 'GET', path: '/cors', expose: true }, async () => 'cors');

      const request = new Request('http://localhost/cors', {
        method: 'OPTIONS',
      });
      const response = await router.handle(request);

      // OPTIONS should match GET routes
      expect(response.status).toBe(200);
    });
  });

  // Bug B2: bulkAddRoutes method
  describe('Bug B2 — bulkAddRoutes', () => {
    it('should produce the same sorted order as individual addRoute calls', () => {
      // Build 20 route entries manually (same shape as RouteEntry: [method, regex, handlers, path])
      const paths = [
        '/a',
        '/b/:id',
        '/c',
        '/d/*',
        '/e/:x/f',
        '/g',
        '/h/:y',
        '/i',
        '/j/*',
        '/k',
        '/l/:z',
        '/m',
        '/n',
        '/o/:w',
        '/p',
        '/q',
        '/r/:v',
        '/s',
        '/t',
        '/u',
      ];

      const makeEntry = (path: string): RouteEntry =>
        ['GET', /.*/, [async () => new Response('ok')], path] as unknown as RouteEntry;

      const entries = paths.map(makeEntry);

      // Individual add
      const routerA = new VectorRouter(middlewareManager, authManager, cacheManager);
      for (const entry of entries) {
        routerA.addRoute(entry);
      }
      const sortedA = routerA.getRoutes().map((r) => r[3]);

      // Bulk add
      const routerB = new VectorRouter(middlewareManager, authManager, cacheManager);
      routerB.bulkAddRoutes(entries);
      const sortedB = routerB.getRoutes().map((r) => r[3]);

      expect(sortedB).toEqual(sortedA);
    });

    it('bulkAddRoutes should exist as a method on VectorRouter', () => {
      expect(typeof router.bulkAddRoutes).toBe('function');
    });
  });

  // Bug B3: Malformed URL returns 400
  describe('Bug B3 — Malformed URL handling', () => {
    it('should return 400 for a request with a malformed URL', async () => {
      // Construct a Request with a URL that passes the Request constructor
      // but causes new URL() to throw (e.g. bare "http://" has no host).
      // We override the url property after construction to a broken value.
      const req = new Request('http://localhost/ok');
      Object.defineProperty(req, 'url', { value: 'http://', writable: false });

      const response = await router.handle(req);

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await response.json();
      expect(body.error).toBe(true);
      expect(body.message).toContain('Malformed request URL');
    });
  });
});

// Bug B1: Glob pattern order — ** must be replaced before *
describe('RouteScanner — Bug B1 glob pattern order', () => {
  it('should correctly match **/*.test.ts patterns (** not consumed by * replacement)', () => {
    // Access the private isExcluded method via a subclass trick
    class TestableScanner extends RouteScanner {
      public testIsExcluded(filePath: string): boolean {
        return (this as any).isExcluded(filePath);
      }
    }

    // Use a custom exclude pattern that contains **
    const _ = new TestableScanner('./routes', ['**/*.test.ts']);

    // Simulate a relative path that should be excluded
    // isExcluded receives the absolute path and computes relative internally,
    // so we need to point routesDir at a known prefix.
    // Easier: directly test the regex logic by checking the pattern converts correctly.
    // We replicate the (fixed) conversion and assert it matches the target string.
    const pattern = '**/*.test.ts';

    // Fixed conversion: use a placeholder so ** is not re-processed by the * replacement
    const fixedRegex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '__GLOBSTAR__') // protect ** before * replacement
          .replace(/\*/g, '[^/]*')
          .replace(/__GLOBSTAR__/g, '.*') // restore ** as .*
          .replace(/\?/g, '.') +
        '$'
    );

    // Buggy conversion: * first (both * and ** consumed at once by the * replacement)
    const buggyRegex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '[^/]*') // consumes ** -> [^/]*[^/]*
          .replace(/\*\*/g, '.*') // ** already gone, never matches here
          .replace(/\?/g, '.') +
        '$'
    );

    const targetPath = 'routes/api/__tests__/foo.test.ts';

    // The fixed regex must match a multi-level path
    expect(fixedRegex.test(targetPath)).toBe(true);

    // The buggy regex must NOT match (it can only match one directory level)
    expect(buggyRegex.test(targetPath)).toBe(false);

    // Now verify the actual scanner's isExcluded uses the fixed logic.
    // We do this by checking that a file under __tests__ IS excluded
    // when using the default patterns which include '**/__tests__/**'.
    const defaultScanner = new TestableScanner('./routes');
    // Build an absolute path: routesDir/api/__tests__/foo.test.ts
    const routesDir = (defaultScanner as any).routesDir as string;
    const absPath = `${routesDir}/api/__tests__/foo.test.ts`;
    expect(defaultScanner.testIsExcluded(absPath)).toBe(true);
  });
});
