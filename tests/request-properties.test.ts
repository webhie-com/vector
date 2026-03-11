import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { MiddlewareManager } from '../src/middleware/manager';
import type { VectorContext } from '../src/types';

describe('Vector Context Contract', () => {
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

  it('provides a separate context object with a raw request reference', async () => {
    let captured: VectorContext | null = null;

    router.route({ method: 'GET', path: '/ctx', expose: true }, async (ctx) => {
      captured = ctx as VectorContext;
      return { ok: true };
    });

    const request = new Request('http://localhost/ctx?x=1', {
      headers: { cookie: 'session=abc', 'x-test': 'value' },
    });
    const response = await router.handle(request);

    expect(response.status).toBe(200);
    expect(captured).not.toBeNull();
    expect(captured).not.toBe(request as any);
    expect(captured!.request).toBe(request);
    expect(captured!.request.method).toBe('GET');
    expect(captured!.request.url).toBe('http://localhost/ctx?x=1');
    expect(captured!.request.headers.get('x-test')).toBe('value');
  });

  it('does not mutate request with framework fields', async () => {
    let capturedRequest: Request | null = null;

    router.route({ method: 'POST', path: '/no-mutate/:id', expose: true }, async (ctx) => {
      capturedRequest = ctx.request;
      return { ok: true };
    });

    const request = new Request('http://localhost/no-mutate/123?page=2', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session=abc' },
      body: JSON.stringify({ name: 'Alice' }),
    });

    const response = await router.handle(request);
    expect(response.status).toBe(200);
    expect(capturedRequest).toBe(request);
    expect((capturedRequest as any).params).toBeUndefined();
    expect((capturedRequest as any).query).toBeUndefined();
    expect((capturedRequest as any).cookies).toBeUndefined();
    expect((capturedRequest as any).content).toBeUndefined();
    expect((capturedRequest as any).metadata).toBeUndefined();
    expect((capturedRequest as any).validatedInput).toBeUndefined();
    expect((capturedRequest as any).authUser).toBeUndefined();
  });

  it('parses request body into context.content only for non-raw requests', async () => {
    let seen: any;

    router.route({ method: 'POST', path: '/json', expose: true }, async (ctx) => {
      seen = {
        content: ctx.content,
        requestContent: (ctx.request as any).content,
      };
      return { ok: true };
    });

    const response = await router.handle(
      new Request('http://localhost/json', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      })
    );

    expect(response.status).toBe(200);
    expect(seen.content).toEqual({ name: 'John' });
    expect(seen.requestContent).toBeUndefined();
  });

  it('does not parse request body into context.content when rawRequest is true', async () => {
    let contentSeen: any = 'unset';

    router.route({ method: 'POST', path: '/raw', expose: true, rawRequest: true }, async (ctx) => {
      contentSeen = ctx.content;
      return { ok: true };
    });

    const response = await router.handle(
      new Request('http://localhost/raw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      })
    );

    expect(response.status).toBe(200);
    expect(contentSeen).toBeUndefined();
  });

  it('initializes context metadata from route options without mutating request', async () => {
    let seenMetadata: any;
    let requestMetadata: any;

    router.route(
      {
        method: 'GET',
        path: '/meta',
        expose: true,
        metadata: { source: 'route' },
      },
      async (ctx) => {
        seenMetadata = ctx.metadata;
        requestMetadata = (ctx.request as any).metadata;
        return { ok: true };
      }
    );

    const response = await router.handle(new Request('http://localhost/meta'));
    expect(response.status).toBe(200);
    expect(seenMetadata).toEqual({ source: 'route' });
    expect(requestMetadata).toBeUndefined();
  });

  it('allows before middleware to mutate context in place', async () => {
    middlewareManager.addBefore((ctx) => {
      ctx.metadata.fromBefore = true;
      (ctx as any).custom = 'ok';
    });

    let captured: any;
    router.route({ method: 'GET', path: '/mw', expose: true }, async (ctx) => {
      captured = {
        metadata: ctx.metadata,
        custom: (ctx as any).custom,
      };
      return { ok: true };
    });

    const response = await router.handle(new Request('http://localhost/mw'));
    expect(response.status).toBe(200);
    expect(captured).toEqual({
      metadata: { fromBefore: true },
      custom: 'ok',
    });
  });

  it('allows before middleware to short-circuit with a Response', async () => {
    let calledHandler = false;

    middlewareManager.addBefore(() => new Response('blocked', { status: 403 }));
    router.route({ method: 'GET', path: '/blocked', expose: true }, async () => {
      calledHandler = true;
      return { ok: true };
    });

    const response = await router.handle(new Request('http://localhost/blocked'));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('blocked');
    expect(calledHandler).toBe(false);
  });

  it('derives params/query/cookies on context without mutating request', async () => {
    let payloadSeenByValidator: any;
    let contextShape: any;

    const input = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: async (payload: unknown) => {
          payloadSeenByValidator = payload;
          return { value: payload };
        },
      },
    };

    router.route(
      {
        method: 'GET',
        path: '/validate/:id',
        expose: true,
        schema: { input: input as any },
      },
      async (ctx) => {
        contextShape = {
          params: ctx.params,
          query: ctx.query,
          cookies: ctx.cookies,
          requestParams: (ctx.request as any).params,
          requestQuery: (ctx.request as any).query,
          requestCookies: (ctx.request as any).cookies,
        };
        return { ok: true };
      }
    );

    const response = await router.handle(
      new Request('http://localhost/validate/42?page=2', {
        headers: { cookie: 'session=abc' },
      })
    );

    expect(response.status).toBe(200);
    expect(payloadSeenByValidator.params).toEqual({ id: '42' });
    expect(payloadSeenByValidator.query).toEqual({ page: '2' });
    expect(payloadSeenByValidator.cookies).toEqual({ session: 'abc' });
    expect(contextShape).toEqual({
      params: { id: '42' },
      query: { page: '2' },
      cookies: { session: 'abc' },
      requestParams: undefined,
      requestQuery: undefined,
      requestCookies: undefined,
    });
  });
});
