import { describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { MiddlewareManager } from '../src/middleware/manager';

function makeRouter() {
  const middleware = new MiddlewareManager();
  const auth = new AuthManager();
  const cache = new CacheManager();
  return {
    router: new VectorRouter(middleware, auth, cache),
    auth,
    middleware,
    cache,
  };
}

describe('Checkpoint config hooks', () => {
  it('executes before/auth/after for both live and tagged checkpoint requests', async () => {
    const { router, auth, middleware } = makeRouter();
    const callLog: string[] = [];
    let liveHandlerCalls = 0;
    let checkpointGatewayCalls = 0;

    middleware.addBefore(async (context) => {
      callLog.push('before');
      context.metadata = context.metadata ?? {};
      context.metadata.fromBefore = true;
    });

    auth.setProtectedHandler(async (context) => {
      callLog.push('auth');
      const token = context.request.headers.get('authorization');
      if (token !== 'Bearer latest-config-token') {
        throw new Error('invalid token');
      }
      return { id: 'cfg-user' };
    });

    middleware.addFinally(async (response, context) => {
      callLog.push('after');
      const cloned = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      });
      cloned.headers.set('x-after-hook', String((context as any).authUser?.id ?? 'none'));
      return cloned;
    });

    router.route(
      {
        method: 'GET',
        path: '/health',
        auth: true,
        expose: true,
      },
      async (context) => {
        liveHandlerCalls += 1;
        return {
          source: 'live',
          beforeSeen: context.metadata?.fromBefore === true,
          userId: context.authUser?.id ?? null,
        };
      }
    );

    router.setCheckpointGateway({
      handle: async (request: Request) => {
        const version = request.headers.get('x-vector-checkpoint-version');
        if (!version) {
          return null;
        }
        checkpointGatewayCalls += 1;
        return Response.json({ source: 'checkpoint', version });
      },
    } as any);

    const liveResponse = await router.handle(
      new Request('http://localhost/health', {
        headers: {
          authorization: 'Bearer latest-config-token',
        },
      })
    );

    expect(liveResponse.status).toBe(200);
    expect(liveResponse.headers.get('x-after-hook')).toBe('cfg-user');
    expect(await liveResponse.json()).toEqual({
      source: 'live',
      beforeSeen: true,
      userId: 'cfg-user',
    });
    expect(liveHandlerCalls).toBe(1);
    expect(checkpointGatewayCalls).toBe(0);
    expect(callLog).toEqual(['before', 'auth', 'after']);

    callLog.length = 0;

    const checkpointResponse = await router.handle(
      new Request('http://localhost/health', {
        headers: {
          authorization: 'Bearer latest-config-token',
          'x-vector-checkpoint-version': '1.0.0',
        },
      })
    );

    expect(checkpointResponse.status).toBe(200);
    expect(checkpointResponse.headers.get('x-after-hook')).toBe('cfg-user');
    expect(await checkpointResponse.json()).toEqual({
      source: 'checkpoint',
      version: '1.0.0',
    });
    expect(liveHandlerCalls).toBe(1);
    expect(checkpointGatewayCalls).toBe(1);
    expect(callLog).toEqual(['before', 'auth', 'after']);

    callLog.length = 0;

    const deniedCheckpointResponse = await router.handle(
      new Request('http://localhost/health', {
        headers: {
          authorization: 'Bearer old-token',
          'x-vector-checkpoint-version': '1.0.0',
        },
      })
    );

    expect(deniedCheckpointResponse.status).toBe(401);
    expect(checkpointGatewayCalls).toBe(1);
    expect(callLog).toEqual(['before', 'auth']);
  });

  it('forwards only supported checkpoint context fields (metadata/content/validatedInput/authUser)', async () => {
    const { router, middleware } = makeRouter();
    let capturedPayload: Record<string, unknown> | null = null;
    let liveHandlerCalls = 0;

    middleware.addBefore(async (ctx) => {
      ctx.metadata = ctx.metadata ?? {};
      (ctx.metadata as Record<string, unknown>).fromBefore = true;
      (ctx as any).traceId = 'trace-123';
    });

    const inputSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value: unknown) => {
          const payload = value as any;
          return {
            value: {
              ...payload,
              query: {
                id: `validated-${payload.query?.id ?? 'none'}`,
              },
            },
          };
        },
      },
    } as any;

    router.route(
      {
        method: 'GET',
        path: '/checkpoint-ctx',
        expose: true,
        schema: { input: inputSchema },
      },
      async () => {
        liveHandlerCalls += 1;
        return { source: 'live' };
      }
    );

    router.setCheckpointGateway({
      handle: async (_request: Request, payload?: Record<string, unknown>) => {
        capturedPayload = payload ?? null;
        return Response.json({ source: 'checkpoint' });
      },
    } as any);

    const response = await router.handle(
      new Request('http://localhost/checkpoint-ctx?id=123', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: 'checkpoint' });
    expect(liveHandlerCalls).toBe(0);
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload?.request).toBeUndefined();
    expect(capturedPayload?.traceId).toBeUndefined();
    expect(capturedPayload?.metadata).toMatchObject({ fromBefore: true });
    expect((capturedPayload?.validatedInput as any)?.query?.id).toBe('validated-123');
    expect(capturedPayload?.query).toBeUndefined();
  });

  it('short-circuits in before hook for both live and checkpoint requests', async () => {
    const { router, middleware } = makeRouter();
    let liveHandlerCalls = 0;
    let checkpointGatewayCalls = 0;
    const callLog: string[] = [];

    middleware.addBefore(async (ctx) => {
      callLog.push('before');
      const shouldBlock = new URL(ctx.request.url).searchParams.get('block') === '1';
      if (shouldBlock) {
        return Response.json({ source: 'before-short-circuit' }, { status: 429 });
      }
    });

    middleware.addFinally(async (response) => {
      callLog.push('after');
      const next = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      });
      next.headers.set('x-after-hook', 'ran');
      return next;
    });

    router.route({ method: 'GET', path: '/edge-before', expose: true }, async () => {
      liveHandlerCalls += 1;
      return { source: 'live' };
    });

    router.setCheckpointGateway({
      handle: async (request: Request) => {
        if (!request.headers.get('x-vector-checkpoint-version')) {
          return null;
        }
        checkpointGatewayCalls += 1;
        return Response.json({ source: 'checkpoint' });
      },
    } as any);

    const liveBlocked = await router.handle(new Request('http://localhost/edge-before?block=1'));
    expect(liveBlocked.status).toBe(429);
    expect(await liveBlocked.json()).toEqual({ source: 'before-short-circuit' });

    const checkpointBlocked = await router.handle(
      new Request('http://localhost/edge-before?block=1', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    expect(checkpointBlocked.status).toBe(429);
    expect(await checkpointBlocked.json()).toEqual({ source: 'before-short-circuit' });

    expect(liveHandlerCalls).toBe(0);
    expect(checkpointGatewayCalls).toBe(0);
    expect(callLog).toEqual(['before', 'before']);
  });

  it('can short-circuit checkpoint-tagged requests in before hook without mutating request', async () => {
    const { router, middleware } = makeRouter();
    let liveHandlerCalls = 0;
    let checkpointGatewayCalls = 0;

    middleware.addBefore(async (ctx) => {
      if (ctx.request.headers.get('x-vector-checkpoint-version')) {
        return Response.json({ source: 'before-short-circuit' }, { status: 409 });
      }
    });

    router.route({ method: 'GET', path: '/header-fallback', expose: true }, async () => {
      liveHandlerCalls += 1;
      return { source: 'live' };
    });

    router.setCheckpointGateway({
      handle: async (request: Request) => {
        if (!request.headers.get('x-vector-checkpoint-version')) {
          return null;
        }
        checkpointGatewayCalls += 1;
        return Response.json({ source: 'checkpoint' });
      },
    } as any);

    const response = await router.handle(
      new Request('http://localhost/header-fallback', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ source: 'before-short-circuit' });
    expect(liveHandlerCalls).toBe(0);
    expect(checkpointGatewayCalls).toBe(0);
  });

  it('applies after hook to checkpoint responses, including non-200 statuses', async () => {
    const { router, middleware } = makeRouter();
    let liveHandlerCalls = 0;
    let checkpointGatewayCalls = 0;

    middleware.addFinally(async (response, context) => {
      const next = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      });
      next.headers.set(
        'x-after-source',
        context.request.headers.get('x-vector-checkpoint-version') ? 'checkpoint' : 'live'
      );
      return next;
    });

    router.route({ method: 'GET', path: '/after-parity', expose: true }, async () => {
      liveHandlerCalls += 1;
      return { source: 'live' };
    });

    router.setCheckpointGateway({
      handle: async (request: Request) => {
        const version = request.headers.get('x-vector-checkpoint-version');
        if (!version) {
          return null;
        }
        checkpointGatewayCalls += 1;
        return new Response(JSON.stringify({ source: 'checkpoint', version }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      },
    } as any);

    const liveResponse = await router.handle(new Request('http://localhost/after-parity'));
    expect(liveResponse.status).toBe(200);
    expect(liveResponse.headers.get('x-after-source')).toBe('live');
    expect(await liveResponse.json()).toEqual({ source: 'live' });

    const checkpointResponse = await router.handle(
      new Request('http://localhost/after-parity', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    expect(checkpointResponse.status).toBe(202);
    expect(checkpointResponse.headers.get('x-after-source')).toBe('checkpoint');
    expect(await checkpointResponse.json()).toEqual({ source: 'checkpoint', version: '1.0.0' });

    expect(liveHandlerCalls).toBe(1);
    expect(checkpointGatewayCalls).toBe(1);
  });

  it('uses config cache for both live and tagged checkpoint requests', async () => {
    const { router, cache } = makeRouter();
    const store = new Map<string, unknown>();
    const cacheKeys: string[] = [];
    let liveHandlerCalls = 0;
    let checkpointGatewayCalls = 0;

    cache.setCacheHandler(async (key, factory) => {
      cacheKeys.push(key);
      if (store.has(key)) {
        return store.get(key);
      }
      const value = await factory();
      store.set(key, value);
      return value;
    });

    router.route(
      {
        method: 'GET',
        path: '/cached-source',
        expose: true,
        cache: 60,
      },
      async () => {
        liveHandlerCalls += 1;
        return { source: 'live', call: liveHandlerCalls };
      }
    );

    router.setCheckpointGateway({
      handle: async (request: Request) => {
        const version = request.headers.get('x-vector-checkpoint-version');
        if (!version) {
          return null;
        }
        checkpointGatewayCalls += 1;
        return Response.json({ source: 'checkpoint', version, call: checkpointGatewayCalls });
      },
      getRequestedVersion: (request: Request) => request.headers.get('x-vector-checkpoint-version'),
    } as any);

    const liveOne = await router.handle(new Request('http://localhost/cached-source'));
    const liveTwo = await router.handle(new Request('http://localhost/cached-source'));
    expect(await liveOne.json()).toEqual({ source: 'live', call: 1 });
    expect(await liveTwo.json()).toEqual({ source: 'live', call: 1 });
    expect(liveHandlerCalls).toBe(1);

    const taggedOne = await router.handle(
      new Request('http://localhost/cached-source', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    const taggedTwo = await router.handle(
      new Request('http://localhost/cached-source', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    expect(await taggedOne.json()).toEqual({ source: 'checkpoint', version: '1.0.0', call: 1 });
    expect(await taggedTwo.json()).toEqual({ source: 'checkpoint', version: '1.0.0', call: 1 });
    expect(checkpointGatewayCalls).toBe(1);

    expect(cacheKeys.some((key) => key.includes(':checkpoint=1.0.0'))).toBe(true);
    expect(cacheKeys.some((key) => !key.includes(':checkpoint='))).toBe(true);
  });
});
