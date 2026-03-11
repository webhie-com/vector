import { describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { VectorServer } from '../src/core/server';
import { MiddlewareManager } from '../src/middleware/manager';
import { AuthKind, OpenApiSecuritySchemeType } from '../src/types';
import { z } from 'zod';

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

  it('publishes security metadata in /openapi.json for auth-enabled routes', async () => {
    const router = makeRouter();
    router.setRouteBooleanDefaults({ auth: AuthKind.ApiKey });
    router.route({ method: 'GET', path: '/secure', expose: true, auth: AuthKind.HttpBearer }, async () => ({
      ok: true,
    }));
    router.route({ method: 'GET', path: '/secure-true', expose: true, auth: true }, async () => ({ ok: true }));
    router.route({ method: 'GET', path: '/secure-default', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        auth: {
          securitySchemeNames: {
            [AuthKind.HttpBearer]: 'jwtAuth',
          },
          securitySchemes: {
            [AuthKind.HttpBearer]: {
              type: OpenApiSecuritySchemeType.Http,
              scheme: 'bearer',
              bearerFormat: 'AccessToken',
            },
          },
        },
      },
    });

    const openapiResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/openapi.json')
    ) as Response;
    expect(openapiResponse.status).toBe(200);

    const spec = await openapiResponse.json();
    expect(spec.paths['/secure'].get.security).toEqual([{ jwtAuth: [] }]);
    expect(spec.paths['/secure-true'].get.security).toEqual([{ apiKeyAuth: [] }]);
    expect(spec.paths['/secure-default'].get.security).toEqual([{ apiKeyAuth: [] }]);
    expect(spec.components.securitySchemes.jwtAuth).toEqual(
      expect.objectContaining({
        type: OpenApiSecuritySchemeType.Http,
        scheme: 'bearer',
        bearerFormat: 'AccessToken',
      })
    );
  });

  it('suppresses openapi conversion warnings when not in debug logging mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;

    const originalWarn = console.warn;
    const warnCalls: string[] = [];
    console.warn = (...args: any[]) => {
      warnCalls.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      const router = makeRouter();
      const throwingOutputSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: async (value: unknown) => ({ value }),
          jsonSchema: {
            input: () => ({ type: 'object' }),
            output: () => {
              throw new Error('not supported');
            },
          },
        },
      };

      router.route(
        {
          method: 'GET',
          path: '/warn',
          expose: true,
          schema: {
            output: {
              200: throwingOutputSchema as any,
            },
          },
        },
        async () => ({ ok: true })
      );

      const server = new VectorServer(router, {
        development: true,
        openapi: {
          enabled: true,
          path: '/openapi.json',
        },
      });

      const response = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/openapi.json'));
      expect(response).toBeInstanceOf(Response);
      expect(warnCalls.length).toBe(0);
    } finally {
      console.warn = originalWarn;
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  it('logs openapi conversion warnings in development when LOG_LEVEL=DEBUG', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'DEBUG';

    const originalWarn = console.warn;
    const warnCalls: string[] = [];
    console.warn = (...args: any[]) => {
      warnCalls.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      const router = makeRouter();
      const throwingOutputSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: async (value: unknown) => ({ value }),
          jsonSchema: {
            input: () => ({ type: 'object' }),
            output: () => {
              throw new Error('not supported');
            },
          },
        },
      };

      router.route(
        {
          method: 'GET',
          path: '/warn-debug',
          expose: true,
          schema: {
            output: {
              200: throwingOutputSchema as any,
            },
          },
        },
        async () => ({ ok: true })
      );

      const server = new VectorServer(router, {
        development: true,
        openapi: {
          enabled: true,
          path: '/openapi.json',
        },
      });

      const response = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/openapi.json'));
      expect(response).toBeInstanceOf(Response);
      expect(warnCalls.some((msg) => msg.includes('Failed output schema conversion for /warn-debug (200)'))).toBe(true);
    } finally {
      console.warn = originalWarn;
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
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
    expect(html).toContain('/_vector/openapi/logo_dark.svg');
    expect(html).toContain('/_vector/openapi/logo_white.svg');
    expect(html).toContain('/_vector/openapi/favicon/apple-touch-icon.png');
    expect(html).toContain('/_vector/openapi/favicon/favicon-32x32.png');
    expect(html).toContain('/_vector/openapi/favicon/favicon-16x16.png');
    expect(html).toContain('/_vector/openapi/favicon/site.webmanifest');
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).toContain('id="sidebar-nav"');
    expect(html).toContain('/openapi.json');
  });

  it('includes advanced auth UI handlers (openIdConnect, apiKey cookie, security alternatives)', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/oidc', expose: true, auth: AuthKind.OpenIdConnect }, async () => ({
      ok: true,
    }));
    router.route({ method: 'GET', path: '/cookie', expose: true, auth: AuthKind.ApiKey }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        auth: {
          securitySchemes: {
            [AuthKind.ApiKey]: {
              type: OpenApiSecuritySchemeType.ApiKey,
              in: 'cookie',
              name: 'session_token',
            },
          },
        },
        docs: {
          enabled: true,
          path: '/docs',
        },
      },
    });

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;
    const html = await docsResponse.text();

    expect(html).toContain('chooseOperationSecurityRequirement');
    expect(html).toContain('AUTH_SELECTION_KEY');
    expect(html).toContain('getSelectedAuthSchemeForOperation');
    expect(html).toContain('setSelectedAuthSchemeForOperation');
    expect(html).toContain('getAuthCookieParams(op)');
    expect(html).toContain('type === "oauth2" || type === "openidconnect"');
    expect(html).toContain('OAuth2 access token…');
    expect(html).toContain('OpenID Connect token…');
    expect(html).toContain('applyAuthCookies(selected)');
    expect(html).toContain('credentials: "same-origin"');
  });

  it('renders response schemas in docs UI for routes with schema.output', async () => {
    const router = makeRouter();
    const outputSchema = z.object({
      id: z.string(),
      email: z.string().email(),
    });

    router.route(
      {
        method: 'POST',
        path: '/users',
        expose: true,
        schema: {
          output: {
            201: outputSchema,
          },
        },
      },
      async () => ({ id: 'u_1', email: 'dev@example.com' })
    );

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
    const html = await docsResponse.text();
    expect(html).toContain('Response Schemas');
    expect(html).toContain('renderResponseSchemasSection(op.responses)');
    expect(html).toContain('<details class="mb-4">');
    expect(html).toContain('data-param-tooltip-description');
    expect(html).toContain('"responses":{"201"');
  });

  it('publishes zod field descriptions and includes tooltip renderer wiring in docs UI', async () => {
    const router = makeRouter();
    const outputSchema = z.object({
      id: z.string().describe('Zod id field'),
      email: z.string().email(),
    });

    router.route(
      {
        method: 'GET',
        path: '/zod-tooltips',
        expose: true,
        schema: {
          output: {
            200: outputSchema,
          },
        },
      },
      async () => ({ id: 'u_1', email: 'dev@example.com' })
    );

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

    const openapiResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/openapi.json')
    ) as Response;
    const spec = await openapiResponse.json();
    expect(
      spec.paths['/zod-tooltips'].get.responses['200'].content['application/json'].schema.properties.id.description
    ).toBe('Zod id field');

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;
    const html = await docsResponse.text();
    expect(html).toContain('data-param-tooltip-description');
    expect(html).toContain('const tooltipDescription =');
  });

  it('filters docs UI to configured docs.exposePaths while keeping openapi.json complete', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));
    router.route({ method: 'GET', path: '/users', expose: true }, async () => ({ users: [] }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
          exposePaths: ['/health'],
        },
      },
    });

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;
    const html = await docsResponse.text();
    expect(html).toContain('/health');
    expect(html).not.toContain('/users');

    const openapiResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/openapi.json')
    ) as Response;
    const spec = await openapiResponse.json();
    expect(spec.paths['/health']).toBeDefined();
    expect(spec.paths['/users']).toBeDefined();
  });

  it('shows all exposed paths when docs.exposePaths is not provided', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));
    router.route({ method: 'GET', path: '/users', expose: true }, async () => ({ users: [] }));

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
    const html = await docsResponse.text();
    expect(html).toContain('/health');
    expect(html).toContain('/users');
  });

  it('shows all exposed paths when docs.exposePaths is an empty array', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));
    router.route({ method: 'GET', path: '/users', expose: true }, async () => ({ users: [] }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
          exposePaths: [],
        },
      },
    });

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;
    const html = await docsResponse.text();
    expect(html).toContain('/health');
    expect(html).toContain('/users');
  });

  it('supports wildcard patterns in docs.exposePaths', async () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/users', expose: true }, async () => ({ users: [] }));
    router.route({ method: 'GET', path: '/users/:id', expose: true }, async () => ({ id: '1' }));
    router.route({ method: 'GET', path: '/health', expose: true }, async () => ({ ok: true }));

    const server = new VectorServer(router, {
      development: true,
      openapi: {
        enabled: true,
        path: '/openapi.json',
        docs: {
          enabled: true,
          path: '/docs',
          exposePaths: ['/users*'],
        },
      },
    });

    const docsResponse = (server as any).tryHandleOpenAPIRequest(new Request('http://localhost/docs')) as Response;
    const html = await docsResponse.text();
    expect(html).toContain('/users');
    expect(html).toContain('/users/{id}');
    expect(html).not.toContain('/health');
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

  it('serves local logo assets for docs UI', async () => {
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

    const darkLogoResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/_vector/openapi/logo_dark.svg')
    ) as Response;
    const whiteLogoResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/_vector/openapi/logo_white.svg')
    ) as Response;

    expect(darkLogoResponse).toBeInstanceOf(Response);
    expect(darkLogoResponse.status).toBe(200);
    expect(darkLogoResponse.headers.get('content-type')).toContain('image/svg+xml');
    expect(darkLogoResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    expect(whiteLogoResponse).toBeInstanceOf(Response);
    expect(whiteLogoResponse.status).toBe(200);
    expect(whiteLogoResponse.headers.get('content-type')).toContain('image/svg+xml');
    expect(whiteLogoResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    const darkLogoSvg = await darkLogoResponse.text();
    const whiteLogoSvg = await whiteLogoResponse.text();
    expect(darkLogoSvg).toContain('fill="#111"');
    expect(whiteLogoSvg).toContain('fill="#fff"');
  });

  it('serves favicon assets and manifest for docs UI', async () => {
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

    const appleIconResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/_vector/openapi/favicon/apple-touch-icon.png')
    ) as Response;
    const faviconIcoResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/_vector/openapi/favicon/favicon.ico')
    ) as Response;
    const manifestResponse = (server as any).tryHandleOpenAPIRequest(
      new Request('http://localhost/_vector/openapi/favicon/site.webmanifest')
    ) as Response;

    expect(appleIconResponse).toBeInstanceOf(Response);
    expect(appleIconResponse.status).toBe(200);
    expect(appleIconResponse.headers.get('content-type')).toContain('image/png');
    expect(appleIconResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    expect(faviconIcoResponse).toBeInstanceOf(Response);
    expect(faviconIcoResponse.status).toBe(200);
    expect(faviconIcoResponse.headers.get('content-type')).toContain('image/x-icon');
    expect(faviconIcoResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    expect(manifestResponse).toBeInstanceOf(Response);
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get('content-type')).toContain('application/manifest+json');
    expect(manifestResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    const manifest = await manifestResponse.text();
    expect(manifest).toContain('/_vector/openapi/favicon/android-chrome-192x192.png');
    expect(manifest).toContain('/_vector/openapi/favicon/android-chrome-512x512.png');
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

  it('rejects user route conflicts with reserved logo asset paths when docs are enabled', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/_vector/openapi/logo_dark.svg', expose: true }, async () => ({ ok: true }));
    router.route({ method: 'GET', path: '/_vector/openapi/logo_white.svg', expose: true }, async () => ({ ok: true }));

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

  it('rejects user route conflicts with reserved favicon asset paths when docs are enabled', () => {
    const router = makeRouter();
    router.route({ method: 'GET', path: '/_vector/openapi/favicon/site.webmanifest', expose: true }, async () => ({
      ok: true,
    }));

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

  it('rejects static route conflicts with reserved openapi path', () => {
    const router = makeRouter();
    router.addStaticRoute('/openapi.json', new Response('shadow'));

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

  it('rejects static route conflicts with reserved docs path when docs are enabled', () => {
    const router = makeRouter();
    router.addStaticRoute('/docs', new Response('shadow'));

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

  it('rejects static route conflicts with reserved docs asset path when docs are enabled', () => {
    const router = makeRouter();
    router.addStaticRoute('/_vector/openapi/tailwindcdn.js', new Response('shadow'));

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

  it('rejects static route conflicts with reserved logo asset paths when docs are enabled', () => {
    const router = makeRouter();
    router.addStaticRoute('/_vector/openapi/logo_dark.svg', new Response('shadow'));
    router.addStaticRoute('/_vector/openapi/logo_white.svg', new Response('shadow'));

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

  it('rejects static route conflicts with reserved favicon asset paths when docs are enabled', () => {
    const router = makeRouter();
    router.addStaticRoute('/_vector/openapi/favicon/site.webmanifest', new Response('shadow'));

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
