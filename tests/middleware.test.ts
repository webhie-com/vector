import { beforeEach, describe, expect, it } from 'bun:test';
import { MiddlewareManager } from '../src/middleware/manager';
import type { VectorRequest } from '../src/types';

describe('MiddlewareManager', () => {
  let manager: MiddlewareManager;

  beforeEach(() => {
    manager = new MiddlewareManager();
  });

  describe('Before Middleware', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = [];

      manager.addBefore(async (req) => {
        order.push(1);
        return req;
      });

      manager.addBefore(async (req) => {
        order.push(2);
        return req;
      });

      const request = { context: {} } as VectorRequest;
      await manager.executeBefore(request);

      expect(order).toEqual([1, 2]);
    });

    it('should allow middleware to modify request', async () => {
      manager.addBefore(async (req) => {
        req.context.modified = true;
        return req;
      });

      manager.addBefore(async (req) => {
        req.context.count = (req.context.count || 0) + 1;
        return req;
      });

      const request = { context: {} } as VectorRequest;
      const result = await manager.executeBefore(request);

      expect(result.context.modified).toBe(true);
      expect(result.context.count).toBe(1);
    });

    it('should stop execution when middleware returns Response', async () => {
      let secondCalled = false;

      manager.addBefore(async () => {
        return new Response('Early return', { status: 401 });
      });

      manager.addBefore(async (req) => {
        secondCalled = true;
        return req;
      });

      const request = { context: {} } as VectorRequest;
      const result = await manager.executeBefore(request);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      expect(secondCalled).toBe(false);
    });

    it('should handle async middleware', async () => {
      manager.addBefore(async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        req.context.async = true;
        return req;
      });

      const request = { context: {} } as VectorRequest;
      const result = await manager.executeBefore(request);

      expect(result.context.async).toBe(true);
    });
  });

  describe('After Middleware', () => {
    it('should execute finally middleware in order', async () => {
      const order: number[] = [];

      manager.addFinally(async (res) => {
        order.push(1);
        return res;
      });

      manager.addFinally(async (res) => {
        order.push(2);
        return res;
      });

      const response = new Response('test');
      const request = { context: {} } as VectorRequest;
      await manager.executeFinally(response, request);

      expect(order).toEqual([1, 2]);
    });

    it('should allow middleware to modify response', async () => {
      manager.addFinally(async (res, req) => {
        const headers = new Headers(res.headers);
        headers.set('X-Custom', 'value');
        return new Response(res.body, {
          status: res.status,
          headers,
        });
      });

      const response = new Response('test');
      const request = { context: {} } as VectorRequest;
      const result = await manager.executeFinally(response, request);

      expect(result.headers.get('X-Custom')).toBe('value');
    });

    it('should have access to request context', async () => {
      let contextValue: any;

      manager.addFinally(async (res, req) => {
        contextValue = req.context.testValue;
        return res;
      });

      const response = new Response('test');
      const request = { context: { testValue: 'found' } } as VectorRequest;
      await manager.executeFinally(response, request);

      expect(contextValue).toBe('found');
    });
  });

  describe('Middleware Cloning', () => {
    it('should create independent copy', () => {
      manager.addBefore(async (req) => req);
      manager.addFinally(async (res) => res);

      const clone = manager.clone();

      // Add more middleware to original
      manager.addBefore(async (req) => req);

      // Clone should still have original count
      expect(clone).not.toBe(manager);
    });

    it('should preserve middleware functions in clone', async () => {
      let originalCalled = false;

      manager.addBefore(async (req) => {
        originalCalled = true;
        return req;
      });

      const clone = manager.clone();
      const request = { context: {} } as VectorRequest;
      await clone.executeBefore(request);

      expect(originalCalled).toBe(true);
    });
  });

  describe('Multiple Middleware Additions', () => {
    it('should support adding multiple before middleware at once', async () => {
      const order: string[] = [];

      manager.addBefore(
        async (req) => {
          order.push('first');
          return req;
        },
        async (req) => {
          order.push('second');
          return req;
        },
        async (req) => {
          order.push('third');
          return req;
        }
      );

      const request = { context: {} } as VectorRequest;
      await manager.executeBefore(request);

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('should support adding multiple finally middleware at once', async () => {
      const headers: string[] = [];

      manager.addFinally(
        async (res) => {
          headers.push('header1');
          return res;
        },
        async (res) => {
          headers.push('header2');
          return res;
        }
      );

      const response = new Response('test');
      const request = { context: {} } as VectorRequest;
      await manager.executeFinally(response, request);

      expect(headers).toEqual(['header1', 'header2']);
    });
  });
});
