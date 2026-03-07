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

    const html = await docsResponse.text();
    expect(html).toContain('Vector API Documentation');
    expect(html).toContain('cdn.tailwindcss.com');
    expect(html).toContain('id="sidebar-nav"');
    expect(html).toContain('/openapi.json');
  });
});
