import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { STATIC_RESPONSES } from '../src/constants';
import { VectorRouter } from '../src/core/router';
import { VectorServer } from '../src/core/server';
import { RouteScanner } from '../src/dev/route-scanner';
import { MiddlewareManager } from '../src/middleware/manager';
import type { LegacyRouteEntry } from '../src/types';

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
    it('should register routes and expose them in getRouteTable()', () => {
      router.route({ method: 'GET', path: '/users/:id', expose: true }, async () => 'user');
      router.route({ method: 'GET', path: '/users/profile', expose: true }, async () => 'profile');
      router.route({ method: 'GET', path: '/users', expose: true }, async () => 'users');

      const table = router.getRouteTable();
      expect(table['/users/:id']).toBeDefined();
      expect(table['/users/profile']).toBeDefined();
      expect(table['/users']).toBeDefined();
    });

    it('should register wildcard routes', () => {
      router.route({ method: 'GET', path: '/files/*', expose: true }, async () => 'files');
      router.route(
        { method: 'GET', path: '/files/specific', expose: true },
        async () => 'specific'
      );

      const table = router.getRouteTable();
      expect(table['/files/*']).toBeDefined();
      expect(table['/files/specific']).toBeDefined();
    });
  });

  describe('Request Handling', () => {
    it('should match routes correctly', async () => {
      router.route({ method: 'GET', path: '/test', expose: true }, async () => ({
        result: 'test',
      }));
      const response = await router.handle(new Request('http://localhost/test'));
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });

    it('should return 404 for unmatched routes', async () => {
      const response = await router.handle(new Request('http://localhost/nonexistent'));
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(404);
    });

    it('should return 403 for non-exposed routes', async () => {
      router.route({ method: 'GET', path: '/internal', expose: false }, async () => ({
        internal: true,
      }));
      const response = await router.handle(new Request('http://localhost/internal'));
      expect(response.status).toBe(403);
    });

    it('should match correct HTTP methods', async () => {
      router.route({ method: 'POST', path: '/data', expose: true }, async () => 'post');
      router.route({ method: 'GET', path: '/data', expose: true }, async () => 'get');
      const getResponse = await router.handle(
        new Request('http://localhost/data', { method: 'GET' })
      );
      const postResponse = await router.handle(
        new Request('http://localhost/data', { method: 'POST' })
      );
      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);
    });
  });

  // Bug B2: bulkAddRoutes method
  describe('Bug B2 — bulkAddRoutes', () => {
    it('should register the same routes as individual addRoute calls', () => {
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

      const makeEntry = (path: string): LegacyRouteEntry => [
        'GET',
        /.*/,
        [async () => new Response('ok')],
        path,
      ];

      const entries = paths.map(makeEntry);

      // Individual add
      const routerA = new VectorRouter(middlewareManager, authManager, cacheManager);
      for (const entry of entries) {
        routerA.addRoute(entry);
      }
      const keysA = Object.keys(routerA.getRouteTable()).sort();

      // Bulk add
      const routerB = new VectorRouter(middlewareManager, authManager, cacheManager);
      routerB.bulkAddRoutes(entries);
      const keysB = Object.keys(routerB.getRouteTable()).sort();

      expect(keysB).toEqual(keysA);
    });

    it('bulkAddRoutes should exist as a method on VectorRouter', () => {
      expect(typeof router.bulkAddRoutes).toBe('function');
    });
  });

  // URL handling: unmatched routes and malformed request URLs
  describe('Request URL handling', () => {
    it('should return 404 for unmatched routes', async () => {
      const response = await router.handle(new Request('http://localhost/no-such-route'));
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe(true);
    });

    it('should return 400 for malformed request URLs', async () => {
      const malformedRequest = {
        url: 'http://%',
        method: 'GET',
        headers: new Headers(),
      } as unknown as Request;

      const response = await router.handle(malformedRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('CORS behavior', () => {
    it('applies CORS headers for array origin configuration on matched routes', async () => {
      router.route({ method: 'GET', path: '/cors-array', expose: true }, async () => ({
        ok: true,
      }));
      new VectorServer(router, {
        cors: {
          origin: ['https://app.example.com'],
          credentials: true,
        },
      });

      const response = await router.handle(
        new Request('http://localhost/cors-array', {
          headers: { origin: 'https://app.example.com' },
        })
      );

      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('vary')).toContain('Origin');
    });

    it('reflects request origin when wildcard origin is used with credentials', async () => {
      router.route({ method: 'GET', path: '/cors-wildcard', expose: true }, async () => ({
        ok: true,
      }));
      new VectorServer(router, {
        cors: {
          origin: '*',
          credentials: true,
        },
      });

      const response = await router.handle(
        new Request('http://localhost/cors-wildcard', {
          headers: { origin: 'https://dashboard.example.com' },
        })
      );

      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://dashboard.example.com'
      );
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('vary')).toContain('Origin');
    });

    it('applies CORS headers to fallback 404 responses', () => {
      const server = new VectorServer(router, {
        cors: {
          origin: ['https://app.example.com'],
          credentials: true,
        },
      });
      const request = new Request('http://localhost/no-route', {
        headers: { origin: 'https://app.example.com' },
      });

      const response = (server as any).applyCors(
        STATIC_RESPONSES.NOT_FOUND.clone(),
        request
      ) as Response;

      expect(response.status).toBe(404);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });

  describe('Route safety and matching behavior', () => {
    it('throws when mixing a static route with a method route for the same path', () => {
      router.addStaticRoute('/mixed', new Response('static'));

      expect(() =>
        router.route({ method: 'GET', path: '/mixed', expose: true }, async () => 'method')
      ).toThrow();
    });

    it('throws when adding a static route for a path that already has method routes', () => {
      router.route({ method: 'GET', path: '/mixed-2', expose: true }, async () => 'method');

      expect(() => router.addStaticRoute('/mixed-2', new Response('static'))).toThrow();
    });

    it('matches more specific routes before wildcard routes', async () => {
      router.route(
        { method: 'GET', path: '/files/*', expose: true },
        async () => new Response('wild')
      );
      router.route(
        { method: 'GET', path: '/files/specific', expose: true },
        async () => new Response('specific')
      );

      const response = await router.handle(new Request('http://localhost/files/specific'));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('specific');
    });

    it('keeps precompiled matchers stable across requests', async () => {
      router.route({ method: 'GET', path: '/stable/:id', expose: true }, async () => ({
        ok: true,
      }));

      const matchers = (router as any).routeMatchers as Array<{ path: string; regex: RegExp }>;
      const before = matchers.find((m) => m.path === '/stable/:id')?.regex;
      expect(before).toBeInstanceOf(RegExp);

      await router.handle(new Request('http://localhost/stable/1'));
      await router.handle(new Request('http://localhost/stable/2'));

      const after = ((router as any).routeMatchers as Array<{ path: string; regex: RegExp }>).find(
        (m) => m.path === '/stable/:id'
      )?.regex;
      expect(after).toBe(before);
    });

    it('does not allow prototype pollution via route path keys', () => {
      const protoBefore = (Object.prototype as any).GET;
      const objectBefore = (Object as any).GET;

      try {
        router.route({ method: 'GET', path: '__proto__', expose: true }, async () => 'ok');
        router.route({ method: 'GET', path: 'constructor', expose: true }, async () => 'ok');

        expect((Object.prototype as any).GET).toBe(protoBefore);
        expect((Object as any).GET).toBe(objectBefore);
      } finally {
        if (protoBefore === undefined) {
          delete (Object.prototype as any).GET;
        } else {
          (Object.prototype as any).GET = protoBefore;
        }

        if (objectBefore === undefined) {
          delete (Object as any).GET;
        } else {
          (Object as any).GET = objectBefore;
        }
      }
    });
  });
});

// Bug B1: Glob pattern order — ** must be replaced before *
describe('RouteScanner — Bug B1 glob pattern order', () => {
  it('should correctly match **/*.test.ts patterns (** not consumed by * replacement)', () => {
    class TestableScanner extends RouteScanner {
      public testIsExcluded(filePath: string): boolean {
        return (this as any).isExcluded(filePath);
      }
    }

    const _ = new TestableScanner('./routes', ['**/*.test.ts']);

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
    const defaultScanner = new TestableScanner('./routes');
    const routesDir = (defaultScanner as any).routesDir as string;
    const absPath = `${routesDir}/api/__tests__/foo.test.ts`;
    expect(defaultScanner.testIsExcluded(absPath)).toBe(true);
  });
});
