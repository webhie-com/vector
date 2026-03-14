import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { STATIC_RESPONSES } from '../src/constants';
import { VectorRouter } from '../src/core/router';
import { VectorServer } from '../src/core/server';
import { Vector, getVectorInstance } from '../src/core/vector';
import { RouteScanner } from '../src/dev/route-scanner';
import { MiddlewareManager } from '../src/middleware/manager';
import { AuthKind, type LegacyRouteEntry, type RouteBooleanDefaults } from '../src/types';

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
      router.route({ method: 'GET', path: '/files/specific', expose: true }, async () => 'specific');

      const routes = router.getRoutes();

      // Specific route should come before wildcard
      expect(routes[0][3]).toBe('/files/specific');
      expect(routes[1][3]).toBe('/files/*');
    });
  });

  describe('Route Specificity Scoring', () => {
    it('should prioritize exact paths', () => {
      router.route({ method: 'GET', path: '/api/v1/users', expose: true }, async () => 'exact');
      router.route({ method: 'GET', path: '/api/:version/users', expose: true }, async () => 'param');
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

    it('should require auth by default when enabled globally', async () => {
      router.setRouteBooleanDefaults({ auth: true });
      router.route(
        {
          method: 'GET',
          path: '/default-protected',
          expose: true,
        },
        async () => ({ ok: true })
      );

      const request = new Request('http://localhost/default-protected', { method: 'GET' });
      const response = await router.handle(request);

      expect(response.status).toBe(401);
    });

    it('should require auth when default auth kind is configured globally', async () => {
      router.setRouteBooleanDefaults({ auth: AuthKind.HttpBasic });
      router.route(
        {
          method: 'GET',
          path: '/default-protected-kind',
          expose: true,
        },
        async () => ({ ok: true })
      );

      const request = new Request('http://localhost/default-protected-kind', { method: 'GET' });
      const response = await router.handle(request);

      expect(response.status).toBe(401);
    });

    it('should normalize auth:true to the default auth kind when configured', () => {
      router.setRouteBooleanDefaults({ auth: AuthKind.HttpDigest });
      router.route(
        {
          method: 'GET',
          path: '/default-kind-explicit-true',
          expose: true,
          auth: true,
        },
        async () => ({ ok: true })
      );

      const route = router.getRouteDefinitions().find((entry) => entry.path === '/default-kind-explicit-true');
      expect(route?.options.auth).toBe(AuthKind.HttpDigest);
    });

    it('should allow route-level auth override when global auth default is enabled', async () => {
      router.setRouteBooleanDefaults({ auth: true });
      router.route(
        {
          method: 'GET',
          path: '/public',
          expose: true,
          auth: false,
        },
        async () => ({ ok: true })
      );

      const request = new Request('http://localhost/public', { method: 'GET' });
      const response = await router.handle(request);

      expect(response.status).toBe(200);
    });

    it('should apply expose default and allow explicit override', async () => {
      router.setRouteBooleanDefaults({ expose: false });
      router.route(
        {
          method: 'GET',
          path: '/hidden-default',
        },
        async () => ({ ok: true })
      );
      router.route(
        {
          method: 'GET',
          path: '/visible-override',
          expose: true,
        },
        async () => ({ ok: true })
      );

      const hiddenResponse = await router.handle(new Request('http://localhost/hidden-default', { method: 'GET' }));
      const visibleResponse = await router.handle(new Request('http://localhost/visible-override', { method: 'GET' }));

      expect(hiddenResponse.status).toBe(403);
      expect(visibleResponse.status).toBe(200);
    });

    it('should apply rawRequest default and allow explicit override', async () => {
      router.setRouteBooleanDefaults({ rawRequest: true });
      let defaultCaptured: unknown = 'unset';
      let overrideCaptured: unknown = 'unset';

      router.route(
        {
          method: 'POST',
          path: '/raw-default',
          expose: true,
        },
        async (req) => {
          defaultCaptured = req.content;
          return { ok: true };
        }
      );
      router.route(
        {
          method: 'POST',
          path: '/raw-override',
          expose: true,
          rawRequest: false,
        },
        async (req) => {
          overrideCaptured = req.content;
          return { ok: true };
        }
      );

      await router.handle(
        new Request('http://localhost/raw-default', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ a: 1 }),
        })
      );
      await router.handle(
        new Request('http://localhost/raw-override', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ a: 1 }),
        })
      );

      expect(defaultCaptured).toBeUndefined();
      expect(overrideCaptured).toEqual({ a: 1 });
    });

    it('should apply rawResponse default and allow explicit override', async () => {
      router.setRouteBooleanDefaults({ rawResponse: true });

      router.route(
        {
          method: 'GET',
          path: '/raw-response-default',
          expose: true,
        },
        async () => 'plain-default'
      );
      router.route(
        {
          method: 'GET',
          path: '/raw-response-override',
          expose: true,
          rawResponse: false,
        },
        async () => 'json-override'
      );

      const defaultResponse = await router.handle(new Request('http://localhost/raw-response-default'));
      const overrideResponse = await router.handle(new Request('http://localhost/raw-response-override'));

      expect(defaultResponse.status).toBe(200);
      expect(await defaultResponse.text()).toBe('plain-default');

      expect(overrideResponse.status).toBe(200);
      expect(await overrideResponse.text()).toBe('"json-override"');
    });

    it('should apply validate default and allow explicit override', async () => {
      router.setRouteBooleanDefaults({ rawRequest: true, validate: false });
      let skippedCalled = false;
      let validatedCalled = false;

      const failingSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: async () => ({
            issues: [{ message: 'must fail', path: ['body'] }],
          }),
        },
      };

      router.route(
        {
          method: 'POST',
          path: '/validate-raw-default-skip',
          expose: true,
          schema: { input: failingSchema },
        },
        async () => {
          skippedCalled = true;
          return { ok: true };
        }
      );
      router.route(
        {
          method: 'POST',
          path: '/validate-raw-default-override',
          expose: true,
          validate: true,
          schema: { input: failingSchema },
        },
        async () => {
          validatedCalled = true;
          return { ok: true };
        }
      );

      const skippedResponse = await router.handle(
        new Request('http://localhost/validate-raw-default-skip', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ a: 1 }),
        })
      );
      const validatedResponse = await router.handle(
        new Request('http://localhost/validate-raw-default-override', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ a: 1 }),
        })
      );

      expect(skippedResponse.status).toBe(200);
      expect(skippedCalled).toBe(true);
      expect(validatedResponse.status).toBe(422);
      expect(validatedCalled).toBe(false);
    });

    it('should match correct HTTP methods', async () => {
      router.route({ method: 'POST', path: '/data', expose: true }, async () => 'post');
      router.route({ method: 'GET', path: '/data', expose: true }, async () => 'get');
      const getResponse = await router.handle(new Request('http://localhost/data', { method: 'GET' }));
      const postResponse = await router.handle(new Request('http://localhost/data', { method: 'POST' }));
      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);
    });

    it('should not fall through OPTIONS to GET handlers', async () => {
      let getCalled = false;

      router.route({ method: 'GET', path: '/options-check', expose: true }, async () => {
        getCalled = true;
        return 'get';
      });

      const optionsResponse = await router.handle(new Request('http://localhost/options-check', { method: 'OPTIONS' }));

      expect(optionsResponse.status).toBe(404);
      expect(getCalled).toBe(false);
    });

    it('should allow HEAD to use GET handlers when HEAD is not defined', async () => {
      let getCalled = false;

      router.route({ method: 'GET', path: '/head-fallback', expose: true }, async () => {
        getCalled = true;
        return 'ok';
      });

      const headResponse = await router.handle(new Request('http://localhost/head-fallback', { method: 'HEAD' }));

      expect(headResponse.status).toBe(200);
      expect(getCalled).toBe(true);
    });

    it('does not mutate request with derived route params when native request does not provide params', async () => {
      let capturedParams: any;

      router.route({ method: 'GET', path: '/native/:id', expose: true }, async (ctx) => {
        capturedParams = (ctx.request as any).params;
        return { ok: true };
      });

      const routeTable = router.getRouteTable();
      const methodMap = routeTable['/native/:id'] as Record<string, (request: Request) => Promise<Response>>;
      const response = await methodMap.GET(new Request('http://localhost/native/123'));

      expect(response.status).toBe(200);
      expect(capturedParams).toBeUndefined();
      expect(await response.json()).toEqual({ ok: true });
    });

    it('does not mutate request with multiple derived params when native request does not provide params', async () => {
      let capturedParams: any;

      router.route({ method: 'GET', path: '/orgs/:orgId/users/:userId', expose: true }, async (ctx) => {
        capturedParams = (ctx.request as any).params;
        return { ok: true };
      });

      const routeTable = router.getRouteTable();
      const methodMap = routeTable['/orgs/:orgId/users/:userId'] as Record<
        string,
        (request: Request) => Promise<Response>
      >;
      const response = await methodMap.GET(new Request('http://localhost/orgs/acme/users/42'));

      expect(response.status).toBe(200);
      expect(capturedParams).toBeUndefined();
      expect(await response.json()).toEqual({ ok: true });
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

      const makeEntry = (path: string): LegacyRouteEntry => ['GET', /.*/, [async () => new Response('ok')], path];

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

    it('should not throw when params is readonly on request objects', async () => {
      router.route({ method: 'GET', path: '/users/:id', expose: true }, async () => ({ ok: true }));

      const request = new Request('http://localhost/users/123');
      Object.defineProperty(request, 'params', {
        value: {},
        writable: false,
        configurable: true,
      });

      const response = await router.handle(request);
      expect(response.status).toBe(200);
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

      expect(response.headers.get('access-control-allow-origin')).toBe('https://dashboard.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('vary')).toContain('Origin');
    });

    it('uses middleware-mutated request headers for dynamic CORS decisions', async () => {
      middlewareManager.addBefore((ctx) => {
        const headers = new Headers(ctx.request.headers);
        headers.set('origin', 'https://allowed.example');
        ctx.request = new Request(ctx.request.url, {
          method: ctx.request.method,
          headers,
        }) as any;
      });

      router.route({ method: 'GET', path: '/cors-mutated-origin', expose: true }, async () => ({
        ok: true,
      }));
      new VectorServer(router, {
        cors: {
          origin: ['https://allowed.example'],
          credentials: true,
        },
      });

      const response = await router.handle(
        new Request('http://localhost/cors-mutated-origin', {
          headers: { origin: 'https://blocked.example' },
        })
      );

      expect(response.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('applies equivalent CORS headers for live and checkpoint requests on same route', async () => {
      middlewareManager.addBefore((ctx) => {
        const headers = new Headers(ctx.request.headers);
        headers.set('origin', 'https://allowed.example');
        ctx.request = new Request(ctx.request.url, {
          method: ctx.request.method,
          headers,
        }) as any;
      });

      router.route({ method: 'GET', path: '/cors-parity', expose: true }, async () => ({ source: 'live' }));
      router.setCheckpointGateway({
        handle: async (request: Request) => {
          if (!request.headers.get('x-vector-checkpoint-version')) {
            return null;
          }
          return Response.json({ source: 'checkpoint' });
        },
      } as any);

      new VectorServer(router, {
        cors: {
          origin: ['https://allowed.example'],
          credentials: true,
        },
      });

      const liveResponse = await router.handle(
        new Request('http://localhost/cors-parity', {
          headers: { origin: 'https://blocked.example' },
        })
      );

      const checkpointResponse = await router.handle(
        new Request('http://localhost/cors-parity', {
          headers: {
            origin: 'https://blocked.example',
            'x-vector-checkpoint-version': '1.0.0',
          },
        })
      );

      expect(liveResponse.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
      expect(checkpointResponse.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
      expect(liveResponse.headers.get('access-control-allow-credentials')).toBe('true');
      expect(checkpointResponse.headers.get('access-control-allow-credentials')).toBe('true');
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

      const response = (server as any).applyCors(STATIC_RESPONSES.NOT_FOUND.clone(), request) as Response;

      expect(response.status).toBe(404);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('applies static CORS headers to server error responses without request context', () => {
      const server = new VectorServer(router, {
        cors: {
          origin: 'https://app.example.com',
          credentials: true,
        },
      });

      const response = (server as any).applyCors(new Response('Internal Server Error', { status: 500 })) as Response;

      expect(response.status).toBe(500);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('applies CORS headers when auth fails without running finally middleware', async () => {
      let finallyExecuted = false;
      middlewareManager.addFinally((response) => {
        finallyExecuted = true;
        response.headers.set('x-after-ran', '1');
        return response;
      });
      authManager.setProtectedHandler(async () => {
        throw new Error('Invalid token');
      });

      router.route({ method: 'GET', path: '/cors-auth-fail', expose: true, auth: true }, async () => ({
        ok: true,
      }));
      new VectorServer(router, {
        cors: {
          origin: ['https://app.example.com'],
          credentials: true,
        },
      });

      const response = await router.handle(
        new Request('http://localhost/cors-auth-fail', {
          headers: { origin: 'https://app.example.com' },
        })
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('x-after-ran')).toBeNull();
      expect(finallyExecuted).toBe(false);
    });

    it('applies CORS headers when before middleware short-circuits without running finally middleware', async () => {
      let finallyExecuted = false;
      middlewareManager.addBefore(() => new Response('blocked', { status: 429 }));
      middlewareManager.addFinally((response) => {
        finallyExecuted = true;
        response.headers.set('x-after-ran', '1');
        return response;
      });

      router.route({ method: 'GET', path: '/cors-before-block', expose: true }, async () => ({
        ok: true,
      }));
      new VectorServer(router, {
        cors: {
          origin: ['https://app.example.com'],
          credentials: true,
        },
      });

      const response = await router.handle(
        new Request('http://localhost/cors-before-block', {
          headers: { origin: 'https://app.example.com' },
        })
      );

      expect(response.status).toBe(429);
      expect(await response.text()).toBe('blocked');
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('x-after-ran')).toBeNull();
      expect(finallyExecuted).toBe(false);
    });

    it('applies CORS headers when route exposure rejects the request', async () => {
      router.route({ method: 'GET', path: '/cors-hidden', expose: false }, async () => ({
        ok: true,
      }));
      new VectorServer(router, {
        cors: {
          origin: ['https://app.example.com'],
          credentials: true,
        },
      });

      const response = await router.handle(
        new Request('http://localhost/cors-hidden', {
          headers: { origin: 'https://app.example.com' },
        })
      );

      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('applies CORS headers to malformed URL bad-request responses', async () => {
      new VectorServer(router, {
        cors: {
          origin: 'https://app.example.com',
          credentials: true,
        },
      });

      const malformedRequest = {
        url: 'http://%',
        method: 'GET',
        headers: new Headers({ origin: 'https://app.example.com' }),
      } as unknown as Request;

      const response = await router.handle(malformedRequest);

      expect(response.status).toBe(400);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });

  describe('Route safety and matching behavior', () => {
    it('throws when mixing a static route with a method route for the same path', () => {
      router.addStaticRoute('/mixed', new Response('static'));

      expect(() => router.route({ method: 'GET', path: '/mixed', expose: true }, async () => 'method')).toThrow();
    });

    it('throws when adding a static route for a path that already has method routes', () => {
      router.route({ method: 'GET', path: '/mixed-2', expose: true }, async () => 'method');

      expect(() => router.addStaticRoute('/mixed-2', new Response('static'))).toThrow();
    });

    it('matches more specific routes before wildcard routes', async () => {
      router.route({ method: 'GET', path: '/files/*', expose: true }, async () => new Response('wild'));
      router.route({ method: 'GET', path: '/files/specific', expose: true }, async () => new Response('specific'));

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
      if (!before) {
        throw new Error('Expected matcher regex to exist before requests');
      }

      await router.handle(new Request('http://localhost/stable/1'));
      await router.handle(new Request('http://localhost/stable/2'));

      const after = ((router as any).routeMatchers as Array<{ path: string; regex: RegExp }>).find(
        (m) => m.path === '/stable/:id'
      )?.regex;
      if (!after) {
        throw new Error('Expected matcher regex to exist after requests');
      }
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

describe('Vector Config Defaults Wiring', () => {
  it('passes defaults.route values into router defaults during startServer', async () => {
    Vector.resetInstance();
    const vector = getVectorInstance();
    const router = vector.getRouter();
    const originalSetDefaults = router.setRouteBooleanDefaults.bind(router);
    const originalSetDevelopmentMode = router.setDevelopmentMode.bind(router);
    const originalStart = VectorServer.prototype.start;
    let capturedDefaults: RouteBooleanDefaults | undefined;
    let capturedDevelopmentMode: boolean | undefined;

    (router as any).setRouteBooleanDefaults = (defaults?: RouteBooleanDefaults) => {
      capturedDefaults = defaults;
      return originalSetDefaults(defaults);
    };
    (router as any).setDevelopmentMode = (mode?: boolean) => {
      capturedDevelopmentMode = mode;
      return originalSetDevelopmentMode(mode);
    };

    VectorServer.prototype.start = async function () {
      return {
        stop() {},
        port: 0,
        hostname: 'localhost',
      } as any;
    };

    try {
      await vector.startServer({
        autoDiscover: false,
        development: false,
        defaults: {
          route: {
            auth: true,
            expose: false,
            rawRequest: true,
            validate: false,
            rawResponse: true,
          },
        },
      });

      expect(capturedDefaults).toEqual({
        auth: true,
        expose: false,
        rawRequest: true,
        validate: false,
        rawResponse: true,
      });
      expect(capturedDevelopmentMode).toBe(false);
    } finally {
      VectorServer.prototype.start = originalStart;
      (router as any).setRouteBooleanDefaults = originalSetDefaults;
      (router as any).setDevelopmentMode = originalSetDevelopmentMode;
      vector.stop();
      Vector.resetInstance();
    }
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
