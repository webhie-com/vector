import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
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
      const request = new Request('http://localhost/nonexistent', { method: 'GET' });
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

      const request = new Request('http://localhost/internal', { method: 'GET' });
      const response = await router.handle(request);

      expect(response.status).toBe(403);
    });
  });

  describe('Method Matching', () => {
    it('should match correct HTTP methods', async () => {
      router.route({ method: 'POST', path: '/data', expose: true }, async () => 'post');
      router.route({ method: 'GET', path: '/data', expose: true }, async () => 'get');

      const getRequest = new Request('http://localhost/data', { method: 'GET' });
      const postRequest = new Request('http://localhost/data', { method: 'POST' });

      const getResponse = await router.handle(getRequest);
      const postResponse = await router.handle(postRequest);

      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);
    });

    it('should handle OPTIONS requests', async () => {
      router.route({ method: 'GET', path: '/cors', expose: true }, async () => 'cors');

      const request = new Request('http://localhost/cors', { method: 'OPTIONS' });
      const response = await router.handle(request);

      // OPTIONS should match GET routes
      expect(response.status).toBe(200);
    });
  });
});
