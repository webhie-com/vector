import { afterEach, describe, expect, it } from 'bun:test';
import { getVectorInstance } from '../src/core/vector';
import { isNativeCompatiblePath, selectNativePaths } from '../src/core/native-routes';

describe('isNativeCompatiblePath', () => {
  it('accepts plain segments and whole-segment params', () => {
    for (const path of ['/', '/health', '/users/:id', '/orders/:orderId/items/:itemId', '/v1.2/a-b_c~d']) {
      expect(isNativeCompatiblePath(path)).toBe(true);
    }
  });

  it('rejects syntax Bun matches differently', () => {
    for (const path of ['*', '/files/*', '/files/:path+', '/files/:name.json', '/users/', '/a/:x/:x', '/a%20b']) {
      expect(isNativeCompatiblePath(path)).toBe(false);
    }
  });
});

describe('selectNativePaths', () => {
  it('keeps routes where a static segment always wins', () => {
    const selected = selectNativePaths(['/hangars/rent', '/hangars/:hangarId', '/hangars/:hangarId/design']);
    expect([...selected].sort()).toEqual(['/hangars/:hangarId', '/hangars/:hangarId/design', '/hangars/rent']);
  });

  it('leaves crossing patterns and everything overlapping them on the JS router', () => {
    const selected = selectNativePaths(['/a/:x/c', '/a/b/:y', '/a/:x/:z', '/other/:id']);
    expect([...selected]).toEqual(['/other/:id']);
  });

  it('leaves shapes that differ only in param names on the JS router', () => {
    const selected = selectNativePaths(['/u/:id', '/u/:userId', '/u/me']);
    expect(selected.size).toBe(0);
  });

  it('excludes native routes a JS-only route could outrank', () => {
    const selected = selectNativePaths(['/static/*', '/:a/:b', '/health']);
    expect([...selected]).toEqual(['/health']);
  });

  it('ignores a bare catch-all, which ranks below every route', () => {
    const selected = selectNativePaths(['*', '/users/:id', '/health']);
    expect([...selected].sort()).toEqual(['/health', '/users/:id']);
  });
});

describe('native routing through Bun.serve', () => {
  const vector = getVectorInstance();
  let baseUrl = '';

  async function start(register: () => void, config: Record<string, unknown> = {}) {
    vector.stop();
    vector.getRouter().clearRoutes();
    register();
    const server = await vector.startServer({
      port: 0,
      hostname: '127.0.0.1',
      autoDiscover: false,
      reusePort: false,
      openapi: false,
      ...config,
    } as any);
    baseUrl = `http://127.0.0.1:${server.port}`;
  }

  afterEach(() => {
    vector.stop();
    vector.getRouter().clearRoutes();
  });

  it('serves params decoded, falls through for missing methods, and keeps the catch-all', async () => {
    await start(() => {
      vector.addRoute({ method: 'GET', path: '/users/:id', auth: false }, async (ctx: any) => ({ id: ctx.params.id }));
      vector.addRoute({ method: 'POST', path: '/:resource/:id', auth: false }, async (ctx: any) => ({
        resource: ctx.params.resource,
      }));
      vector.addRoute({ method: 'GET', path: '*', auth: false, rawResponse: true }, async () => {
        return new Response('custom 404', { status: 404 });
      });
    });

    expect(await (await fetch(`${baseUrl}/users/a%20b`)).json()).toEqual({ id: 'a b' });
    // No POST on /users/:id: Bun falls through to the JS router, which finds /:resource/:id.
    expect(await (await fetch(`${baseUrl}/users/7`, { method: 'POST' })).json()).toEqual({ resource: 'users' });
    const missing = await fetch(`${baseUrl}/nope/missing/deep`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('custom 404');
  });

  it('parses cookies from the header on native routes, not from Bun\'s CookieMap', async () => {
    await start(() => {
      vector.addRoute({ method: 'GET', path: '/me/:id', auth: false }, async (ctx: any) => ({
        cookies: ctx.cookies,
        query: ctx.query,
      }));
    });

    const res = await fetch(`${baseUrl}/me/1?tag=a&tag=b`, {
      headers: { cookie: 'session=first; encoded=a%20b; session=second' },
    });
    expect(await res.json()).toEqual({
      cookies: { session: 'second', encoded: 'a%20b' },
      query: { tag: ['a', 'b'] },
    });
  });

  it('answers CORS preflight for native routes', async () => {
    await start(
      () => {
        vector.addRoute({ method: 'GET', path: '/users/:id', auth: false }, async () => ({ ok: true }));
      },
      { cors: { origin: '*', credentials: true } }
    );

    const preflight = await fetch(`${baseUrl}/users/1`, {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example.com' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.example.com');

    const res = await fetch(`${baseUrl}/users/1`, { headers: { origin: 'https://app.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('picks up routes added after the server started', async () => {
    await start(() => {
      vector.addRoute({ method: 'GET', path: '/users/:id', auth: false }, async () => ({ route: 'param' }));
    });
    expect(await (await fetch(`${baseUrl}/users/me`)).json()).toEqual({ route: 'param' });

    vector.addRoute({ method: 'GET', path: '/users/me', auth: false }, async () => ({ route: 'me' }));
    await Promise.resolve();

    expect(await (await fetch(`${baseUrl}/users/me`)).json()).toEqual({ route: 'me' });
    expect(await (await fetch(`${baseUrl}/users/2`)).json()).toEqual({ route: 'param' });
  });

  it('keeps the OpenAPI document ahead of a native param route', async () => {
    await start(
      () => {
        vector.addRoute({ method: 'GET', path: '/:slug', auth: false }, async () => ({ route: 'slug' }));
      },
      { openapi: { enabled: true } }
    );

    const doc = await (await fetch(`${baseUrl}/openapi.json`)).json();
    expect(doc.openapi).toBeDefined();
    expect(await (await fetch(`${baseUrl}/about`)).json()).toEqual({ route: 'slug' });
  });
});
