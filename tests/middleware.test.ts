import { beforeEach, describe, expect, it } from 'bun:test';
import { MiddlewareManager } from '../src/middleware/manager';
import type { VectorContext } from '../src/types';

describe('MiddlewareManager', () => {
  let manager: MiddlewareManager;

  beforeEach(() => {
    manager = new MiddlewareManager();
  });

  function makeContext(): VectorContext {
    return {
      request: new Request('http://localhost/test'),
      metadata: {},
    } as VectorContext;
  }

  describe('Before Middleware', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = [];

      manager.addBefore(async () => {
        order.push(1);
      });

      manager.addBefore(async () => {
        order.push(2);
      });

      await manager.executeBefore(makeContext());
      expect(order).toEqual([1, 2]);
    });

    it('should allow middleware to modify context', async () => {
      const context = makeContext();

      manager.addBefore(async (ctx) => {
        ctx.metadata.modified = true;
      });

      manager.addBefore(async (ctx) => {
        ctx.metadata.count = (ctx.metadata.count || 0) + 1;
      });

      const result = await manager.executeBefore(context);

      expect(result).toBeNull();
      expect(context.metadata.modified).toBe(true);
      expect(context.metadata.count).toBe(1);
    });

    it('should stop execution when middleware returns Response', async () => {
      let secondCalled = false;

      manager.addBefore(async () => {
        return new Response('Early return', { status: 401 });
      });

      manager.addBefore(async () => {
        secondCalled = true;
      });

      const result = await manager.executeBefore(makeContext());

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      expect(secondCalled).toBe(false);
    });

    it('should handle async middleware', async () => {
      const context = makeContext();

      manager.addBefore(async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        ctx.metadata.async = true;
      });

      const result = await manager.executeBefore(context);

      expect(result).toBeNull();
      expect(context.metadata.async).toBe(true);
    });

    it('should throw on invalid non-void return values', async () => {
      manager.addBefore(async () => {
        return {} as any;
      });

      await expect(manager.executeBefore(makeContext())).rejects.toThrow(
        'Before middleware must return void or Response'
      );
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
      await manager.executeFinally(response, makeContext());

      expect(order).toEqual([1, 2]);
    });

    it('should allow middleware to modify response', async () => {
      manager.addFinally(async (res) => {
        const headers = new Headers(res.headers);
        headers.set('X-Custom', 'value');
        return new Response(res.body, {
          status: res.status,
          headers,
        });
      });

      const response = new Response('test');
      const result = await manager.executeFinally(response, makeContext());

      expect(result.headers.get('X-Custom')).toBe('value');
    });

    it('should have access to context metadata', async () => {
      let contextValue: any;

      manager.addFinally(async (res, ctx) => {
        contextValue = ctx.metadata.testValue;
        return res;
      });

      const context = makeContext();
      context.metadata = { testValue: 'found' };
      await manager.executeFinally(new Response('test'), context);

      expect(contextValue).toBe('found');
    });
  });

  describe('Middleware Cloning', () => {
    it('should create independent copy', () => {
      manager.addBefore(async () => {});
      manager.addFinally(async (res) => res);

      const clone = manager.clone();

      manager.addBefore(async () => {});

      expect(clone).not.toBe(manager);
    });

    it('should preserve middleware functions in clone', async () => {
      let originalCalled = false;

      manager.addBefore(async () => {
        originalCalled = true;
      });

      const clone = manager.clone();
      await clone.executeBefore(makeContext());

      expect(originalCalled).toBe(true);
    });
  });

  describe('Multiple Middleware Additions', () => {
    it('should support adding multiple before middleware at once', async () => {
      const order: string[] = [];

      manager.addBefore(
        async () => {
          order.push('first');
        },
        async () => {
          order.push('second');
        },
        async () => {
          order.push('third');
        }
      );

      await manager.executeBefore(makeContext());

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

      await manager.executeFinally(new Response('test'), makeContext());

      expect(headers).toEqual(['header1', 'header2']);
    });
  });
});
