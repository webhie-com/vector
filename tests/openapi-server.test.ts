import { describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { VectorServer } from '../src/core/server';
import { MiddlewareManager } from '../src/middleware/manager';

function makeRouter() {
  const middleware = new MiddlewareManager();
  const auth = new AuthManager();
  const cache = new CacheManager();
  return new VectorRouter(middleware, auth, cache);
}

describe('OpenAPI server endpoints', () => {
  it('serves /openapi.json in development by default and keeps /docs disabled', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
    });

    const openapiResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/openapi.json')
    ) as Response;

    expect(openapiResponse).toBeInstanceOf(Response);
    expect(openapiResponse.status).toBe(200);

    const spec = await openapiResponse.json();
    expect(spec.paths['/health']).toBeDefined();

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs'));
    expect(docsResponse).toBeNull();
  });

  it('disables /openapi.json by default in production', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: false,
    });

    const response = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/openapi.json'));

    expect(response).toBeNull();
  });

  it('serves custom docs UI HTML when docs are enabled', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;

    expect(docsResponse).toBeInstanceOf(Response);
    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get('content-type')).toContain('text/html');
    expect(docsResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(docsResponse.headers.get('etag')).toBeTruthy();
    expect(docsResponse.headers.get('vary')).toBe('accept-encoding');

    const html = await docsResponse.text();
    expect(html).toContain('Vector API Documentation');
    expect(html).toContain('/_vector/openapi/tailwindcdn.js');
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).toContain('id="sidebar-nav"');
    expect(html).toContain('/openapi.json');
  });

  it('serves gzip docs HTML when client accepts gzip', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    const docsResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/docs', { headers: { 'accept-encoding': 'gzip, br' } })
    ) as Response;

    expect(docsResponse).toBeInstanceOf(Response);
    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get('content-encoding')).toBe('gzip');
    expect(docsResponse.headers.get('content-type')).toContain('text/html');
    expect(docsResponse.headers.get('vary')).toBe('accept-encoding');
  });

  it('returns 304 for docs HTML when etag matches', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    const firstResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;
    const etag = firstResponse.headers.get('etag');
    expect(etag).toBeTruthy();

    const secondResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/docs', { headers: { 'if-none-match': etag! } })
    ) as Response;

    expect(secondResponse.status).toBe(304);
    expect(secondResponse.headers.get('etag')).toBe(etag);
    expect(secondResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
  });

  it('serves local Tailwind runtime asset for docs UI', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    const scriptResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/_vector/openapi/tailwindcdn.js')
    ) as Response;

    expect(scriptResponse).toBeInstanceOf(Response);
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.headers.get('content-type')).toContain('application/javascript');
    expect(scriptResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    const script = await scriptResponse.text();
    expect(script).toContain('cdn.tailwindcss.com should not be used in production');
  });

  it('keeps user /docs route in OpenAPI spec when docs UI is disabled', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/docs', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: false,
          path: '/docs',
        },
      },
    });

    const openapiResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/openapi.json')
    ) as Response;

    const spec = await openapiResponse.json();
    expect(spec.paths['/docs']).toBeDefined();

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs'));
    expect(docsResponse).toBeNull();
  });

  it('rejects user route conflicts with reserved openapi path', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/openapi.json', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: false,
          path: '/docs',
        },
      },
    });

    expect(() => (server as any).validateReservedOpenAPIPaths()).toThrow(/reserved path conflict/i);
  });

  it('rejects user route conflicts with reserved docs path when docs are enabled', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/docs', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    expect(() => (server as any).validateReservedOpenAPIPaths()).toThrow(/reserved path conflict/i);
  });

  it('does not reject /docs route when docs UI is disabled', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/docs', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: false,
          path: '/docs',
        },
      },
    });

    expect(() => (server as any).validateReservedOpenAPIPaths()).not.toThrow();
  });

  it('rejects user route conflicts with reserved docs asset path when docs are enabled', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/_vector/openapi/tailwindcdn.js', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    expect(() => (server as any).validateReservedOpenAPIPaths()).toThrow(/reserved path conflict/i);
  });
});
