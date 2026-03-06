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
    cache,
    middleware,
  };
}

function jsonRequest(url: string, method = 'POST', body?: object) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method !== 'GET' && { body: body ? JSON.stringify(body) : undefined }),
  });
}

describe('Router — request body parsing', () => {
  it('parses JSON body on POST', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/data', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    await router.handle(jsonRequest('http://localhost/data', 'POST', { name: 'Alice' }));
    expect(captured).toEqual({ name: 'Alice' });
  });

  it('parses application/x-www-form-urlencoded body', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/form', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    const req = new Request('http://localhost/form', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=bob&age=30',
    });
    await router.handle(req);

    expect(captured).toMatchObject({ username: 'bob', age: '30' });
  });

  it('parses plain text body', async () => {
    const { router } = makeRouter();
    let captured: any;

    router.route({ method: 'POST', path: '/text', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    const req = new Request('http://localhost/text', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello world',
    });
    await router.handle(req);

    expect(captured).toBe('hello world');
  });

  it('does not parse body for GET requests', async () => {
    const { router } = makeRouter();
    let captured: any = 'untouched';

    router.route({ method: 'GET', path: '/read', expose: true }, async (req) => {
      captured = req.content;
      return { ok: true };
    });

    await router.handle(new Request('http://localhost/read'));
    expect(captured).toBeUndefined();
  });

  it('skips parsing when rawRequest is true', async () => {
    const { router } = makeRouter();
    let captured: any = 'untouched';

    router.route({ method: 'POST', path: '/raw', expose: true, rawRequest: true }, async (req) => {
      captured = req.content;
      return new Response('ok');
    });

    await router.handle(jsonRequest('http://localhost/raw', 'POST', { x: 1 }));
    expect(captured).toBeUndefined();
  });
});

describe('Router — authentication integration', () => {
  it('calls authenticate on auth:true routes', async () => {
    const { router, auth } = makeRouter();
    auth.setProtectedHandler(async () => ({ id: '1' }));

    let authUserOnRequest: any;
    router.route({ method: 'GET', path: '/protected', expose: true, auth: true }, async (req) => {
      authUserOnRequest = req.authUser;
      return { secret: true };
    });

    const res = await router.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(200);
    expect(authUserOnRequest).toEqual({ id: '1' });
  });

  it('returns 401 when authenticate throws', async () => {
    const { router, auth } = makeRouter();
    auth.setProtectedHandler(async () => {
      throw new Error('invalid token');
    });

    router.route({ method: 'GET', path: '/protected', expose: true, auth: true }, async () => ({
      secret: true,
    }));

    const res = await router.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when no handler configured', async () => {
    const { router } = makeRouter();

    router.route({ method: 'GET', path: '/protected', expose: true, auth: true }, async () => ({
      secret: true,
    }));

    const res = await router.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(401);
  });

  it('skips authenticate on auth:false routes', async () => {
    const { router } = makeRouter();
    // No handler set — would throw if called
    let handlerCalled = false;

    router.route({ method: 'GET', path: '/public', expose: true, auth: false }, async () => {
      handlerCalled = true;
      return { public: true };
    });

    const res = await router.handle(new Request('http://localhost/public'));
    expect(res.status).toBe(200);
    expect(handlerCalled).toBe(true);
  });
});

describe('Router — caching integration', () => {
  it('caches handler result with numeric ttl', async () => {
    const { router } = makeRouter();
    let callCount = 0;

    router.route({ method: 'GET', path: '/cached', expose: true, cache: 60 }, async () => {
      callCount++;
      return { value: callCount };
    });

    await router.handle(new Request('http://localhost/cached'));
    await router.handle(new Request('http://localhost/cached'));

    expect(callCount).toBe(1);
  });

  it('caches handler result with object ttl', async () => {
    const { router } = makeRouter();
    let callCount = 0;

    router.route(
      { method: 'GET', path: '/cached-obj', expose: true, cache: { ttl: 60 } },
      async () => {
        callCount++;
        return { value: callCount };
      }
    );

    await router.handle(new Request('http://localhost/cached-obj'));
    await router.handle(new Request('http://localhost/cached-obj'));

    expect(callCount).toBe(1);
  });

  it('does not cache when cache is undefined', async () => {
    const { router } = makeRouter();
    let callCount = 0;

    router.route({ method: 'GET', path: '/uncached', expose: true, cache: undefined }, async () => {
      callCount++;
      return { value: callCount };
    });

    await router.handle(new Request('http://localhost/uncached'));
    await router.handle(new Request('http://localhost/uncached'));

    expect(callCount).toBe(2);
  });
});

describe('Router — error handling', () => {
  it('returns 500 when handler throws an Error', async () => {
    const { router } = makeRouter();

    router.route({ method: 'GET', path: '/boom', expose: true }, async () => {
      throw new Error('something broke');
    });

    const res = await router.handle(new Request('http://localhost/boom'));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.message).toContain('something broke');
  });

  it('returns the thrown Response directly', async () => {
    const { router } = makeRouter();

    router.route({ method: 'GET', path: '/early', expose: true }, async () => {
      throw new Response('early exit', { status: 418 });
    });

    const res = await router.handle(new Request('http://localhost/early'));
    expect(res.status).toBe(418);
  });

  it('returns rawResponse when option is set', async () => {
    const { router } = makeRouter();

    router.route(
      { method: 'GET', path: '/raw-response', expose: true, rawResponse: true },
      async () => new Response('custom', { status: 202 })
    );

    const res = await router.handle(new Request('http://localhost/raw-response'));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('custom');
  });
});
