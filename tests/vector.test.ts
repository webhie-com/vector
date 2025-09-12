import { beforeEach, describe, expect, it } from 'bun:test';
import { createVector } from '../src';
import type { VectorTypes } from '../src/types';

describe('Vector Core', () => {
  let vector: any;

  beforeEach(() => {
    vector = createVector();
  });

  describe('Instance Creation', () => {
    it('should create a singleton instance', () => {
      const vector1 = createVector();
      const vector2 = createVector();
      expect(vector1).toBe(vector2);
    });

    it('should have all required methods', () => {
      expect(vector.route).toBeFunction();
      expect(vector.serve).toBeFunction();
      expect(vector.use).toBeFunction();
      expect(vector.before).toBeFunction();
      expect(vector.finally).toBeFunction();
      expect(vector.getCacheManager).toBeFunction();
      expect(vector.getAuthManager).toBeFunction();
    });
  });

  describe('Route Registration', () => {
    it('should register a basic route', () => {
      const routeEntry = vector.route(
        {
          method: 'GET',
          path: '/test',
          expose: true,
        },
        async () => {
          return { message: 'test' };
        }
      );

      expect(routeEntry).toBeArray();
      expect(routeEntry[0]).toBe('GET');
      expect(routeEntry[3]).toBe('/test');
    });

    it('should register routes with different methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      methods.forEach((method) => {
        const route = vector.route(
          {
            method,
            path: `/test-${method.toLowerCase()}`,
            expose: true,
          },
          async () => ({ method })
        );

        expect(route[0]).toBe(method);
      });
    });

    it('should handle parametric routes', () => {
      const route = vector.route(
        {
          method: 'GET',
          path: '/users/:id',
          expose: true,
        },
        async (request) => {
          return { userId: request.params?.id };
        }
      );

      expect(route[3]).toBe('/users/:id');
    });
  });

  describe('Middleware', () => {
    it('should register before middleware', () => {
      let middlewareCalled = false;

      vector.before(async (request: any) => {
        middlewareCalled = true;
        return request;
      });

      // Middleware is registered but not executed until serve
      expect(middlewareCalled).toBe(false);
    });

    it('should register finally middleware', () => {
      let finallyCalled = false;

      vector.finally(async (response: Response) => {
        finallyCalled = true;
        return response;
      });

      // Middleware is registered but not executed until serve
      expect(finallyCalled).toBe(false);
    });

    it('should support chaining middleware methods', () => {
      const result = vector
        .use(async (req: any) => req)
        .before(async (req: any) => req)
        .finally(async (res: Response) => res);

      expect(result).toBe(vector);
    });
  });

  describe('Authentication', () => {
    it('should allow setting protected handler', () => {
      const authHandler = async () => ({ id: '123', email: 'test@test.com' });
      vector.protected = authHandler;
      expect(vector.protected).toBe(authHandler);
    });

    it('should register protected routes', () => {
      const route = vector.route(
        {
          method: 'GET',
          path: '/protected',
          auth: true,
          expose: true,
        },
        async () => ({ secure: true })
      );

      expect(route).toBeDefined();
    });
  });

  describe('Cache Configuration', () => {
    it('should allow setting cache handler', () => {
      const cacheHandler = async (key: string, factory: () => Promise<any>, ttl: number) => {
        return factory();
      };
      vector.cache = cacheHandler;
      expect(vector.cache).toBe(cacheHandler);
    });

    it('should register cached routes', () => {
      const route = vector.route(
        {
          method: 'GET',
          path: '/cached',
          cache: 300,
          expose: true,
        },
        async () => ({ cached: true })
      );

      expect(route).toBeDefined();
    });
  });
});

describe('Vector with Custom Types', () => {
  interface CustomUser {
    userId: string;
    role: string;
  }

  interface CustomTypes extends VectorTypes {
    auth: CustomUser;
    context: { requestId: string };
    cache: { data: any; version: number };
    metadata: { tags: string[] };
  }

  it('should accept custom types', () => {
    const vector = createVector<CustomTypes>();

    vector.protected = async (): Promise<CustomUser> => ({
      userId: '123',
      role: 'admin',
    });

    const route = vector.route(
      {
        method: 'GET',
        path: '/typed',
        expose: true,
        metadata: { tags: ['test'] },
      },
      async (request) => {
        // TypeScript should recognize these types
        const context = request.context; // { requestId: string }
        const metadata = request.metadata; // { tags: string[] }
        return { context, metadata };
      }
    );

    expect(route).toBeDefined();
  });
});
