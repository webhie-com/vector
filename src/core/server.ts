import type { Server } from 'bun';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { STATIC_RESPONSES } from '../constants';
import { cors } from '../utils/cors';
import { renderOpenAPIDocsHtml } from '../openapi/docs-ui';
import { generateOpenAPIDocument } from '../openapi/generator';
import type { CorsOptions, DefaultVectorTypes, OpenAPIOptions, VectorConfig, VectorTypes } from '../types';
import type { VectorRouter } from './router';

interface NormalizedOpenAPIConfig {
  enabled: boolean;
  path: string;
  target: string;
  docs: {
    enabled: boolean;
    path: string;
    exposePaths?: string[];
  };
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
}

const OPENAPI_TAILWIND_ASSET_PATH = '/_vector/openapi/tailwindcdn.js';
const OPENAPI_LOGO_DARK_ASSET_PATH = '/_vector/openapi/logo_dark.svg';
const OPENAPI_LOGO_WHITE_ASSET_PATH = '/_vector/openapi/logo_white.svg';
const OPENAPI_APPLE_TOUCH_ICON_ASSET_PATH = '/_vector/openapi/favicon/apple-touch-icon.png';
const OPENAPI_FAVICON_32_ASSET_PATH = '/_vector/openapi/favicon/favicon-32x32.png';
const OPENAPI_FAVICON_16_ASSET_PATH = '/_vector/openapi/favicon/favicon-16x16.png';
const OPENAPI_FAVICON_ICO_ASSET_PATH = '/_vector/openapi/favicon/favicon.ico';
const OPENAPI_WEBMANIFEST_ASSET_PATH = '/_vector/openapi/favicon/site.webmanifest';
const OPENAPI_ANDROID_192_ASSET_PATH = '/_vector/openapi/favicon/android-chrome-192x192.png';
const OPENAPI_ANDROID_512_ASSET_PATH = '/_vector/openapi/favicon/android-chrome-512x512.png';
const OPENAPI_TAILWIND_ASSET_RELATIVE_CANDIDATES = [
  // Source execution (src/core/server.ts -> src/openapi/assets/tailwindcdn.js)
  '../openapi/assets/tailwindcdn.js',
  // Bundled dist entrypoints (dist/index.mjs|dist/cli.js -> src/openapi/assets/tailwindcdn.js)
  '../src/openapi/assets/tailwindcdn.js',
  // Unbundled dist/core/server.js execution (dist/core -> src/openapi/assets/tailwindcdn.js)
  '../../src/openapi/assets/tailwindcdn.js',
] as const;
const OPENAPI_LOGO_DARK_ASSET_RELATIVE_CANDIDATES = [
  // Source execution (src/core/server.ts -> src/openapi/assets/logo_dark.svg)
  '../openapi/assets/logo_dark.svg',
  // Bundled dist entrypoints (dist/index.mjs|dist/cli.js -> src/openapi/assets/logo_dark.svg)
  '../src/openapi/assets/logo_dark.svg',
  // Unbundled dist/core/server.js execution (dist/core -> src/openapi/assets/logo_dark.svg)
  '../../src/openapi/assets/logo_dark.svg',
] as const;
const OPENAPI_LOGO_WHITE_ASSET_RELATIVE_CANDIDATES = [
  // Source execution (src/core/server.ts -> src/openapi/assets/logo_white.svg)
  '../openapi/assets/logo_white.svg',
  // Bundled dist entrypoints (dist/index.mjs|dist/cli.js -> src/openapi/assets/logo_white.svg)
  '../src/openapi/assets/logo_white.svg',
  // Unbundled dist/core/server.js execution (dist/core -> src/openapi/assets/logo_white.svg)
  '../../src/openapi/assets/logo_white.svg',
] as const;
const OPENAPI_TAILWIND_ASSET_CWD_CANDIDATES = [
  'src/openapi/assets/tailwindcdn.js',
  'openapi/assets/tailwindcdn.js',
  'dist/openapi/assets/tailwindcdn.js',
] as const;
const OPENAPI_LOGO_DARK_ASSET_CWD_CANDIDATES = [
  'src/openapi/assets/logo_dark.svg',
  'openapi/assets/logo_dark.svg',
  'dist/openapi/assets/logo_dark.svg',
] as const;
const OPENAPI_LOGO_WHITE_ASSET_CWD_CANDIDATES = [
  'src/openapi/assets/logo_white.svg',
  'openapi/assets/logo_white.svg',
  'dist/openapi/assets/logo_white.svg',
] as const;
const OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES = [
  '../openapi/assets/favicon',
  '../src/openapi/assets/favicon',
  '../../src/openapi/assets/favicon',
] as const;
const OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES = [
  'src/openapi/assets/favicon',
  'openapi/assets/favicon',
  'dist/openapi/assets/favicon',
] as const;
const OPENAPI_TAILWIND_ASSET_INLINE_FALLBACK = '/* OpenAPI docs runtime asset missing: tailwind disabled */';

function buildOpenAPIAssetCandidatePaths(bases: readonly string[], filename: string): string[] {
  return bases.map((base) => `${base}/${filename}`);
}

function resolveOpenAPIAssetFile(
  relativeCandidates: readonly string[],
  cwdCandidates: readonly string[]
): ReturnType<typeof Bun.file> | null {
  for (const relativePath of relativeCandidates) {
    try {
      const fileUrl = new URL(relativePath, import.meta.url);
      if (existsSync(fileUrl)) {
        return Bun.file(fileUrl);
      }
    } catch {
      // Ignore resolution failures and try the next candidate.
    }
  }

  const cwd = process.cwd();
  for (const relativePath of cwdCandidates) {
    const absolutePath = join(cwd, relativePath);
    if (existsSync(absolutePath)) {
      return Bun.file(absolutePath);
    }
  }

  return null;
}

const OPENAPI_TAILWIND_ASSET_FILE = resolveOpenAPIAssetFile(
  OPENAPI_TAILWIND_ASSET_RELATIVE_CANDIDATES,
  OPENAPI_TAILWIND_ASSET_CWD_CANDIDATES
);
const OPENAPI_LOGO_DARK_ASSET_FILE = resolveOpenAPIAssetFile(
  OPENAPI_LOGO_DARK_ASSET_RELATIVE_CANDIDATES,
  OPENAPI_LOGO_DARK_ASSET_CWD_CANDIDATES
);
const OPENAPI_LOGO_WHITE_ASSET_FILE = resolveOpenAPIAssetFile(
  OPENAPI_LOGO_WHITE_ASSET_RELATIVE_CANDIDATES,
  OPENAPI_LOGO_WHITE_ASSET_CWD_CANDIDATES
);
const OPENAPI_APPLE_TOUCH_ICON_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'apple-touch-icon.png'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'apple-touch-icon.png')
);
const OPENAPI_FAVICON_32_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'favicon-32x32.png'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'favicon-32x32.png')
);
const OPENAPI_FAVICON_16_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'favicon-16x16.png'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'favicon-16x16.png')
);
const OPENAPI_FAVICON_ICO_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'favicon.ico'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'favicon.ico')
);
const OPENAPI_WEBMANIFEST_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'site.webmanifest'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'site.webmanifest')
);
const OPENAPI_ANDROID_192_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'android-chrome-192x192.png'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'android-chrome-192x192.png')
);
const OPENAPI_ANDROID_512_ASSET_FILE = resolveOpenAPIAssetFile(
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_RELATIVE_BASE_CANDIDATES, 'android-chrome-512x512.png'),
  buildOpenAPIAssetCandidatePaths(OPENAPI_FAVICON_ASSET_CWD_BASE_CANDIDATES, 'android-chrome-512x512.png')
);
const OPENAPI_FAVICON_ASSETS = [
  {
    path: OPENAPI_APPLE_TOUCH_ICON_ASSET_PATH,
    file: OPENAPI_APPLE_TOUCH_ICON_ASSET_FILE,
    contentType: 'image/png',
    filename: 'apple-touch-icon.png',
  },
  {
    path: OPENAPI_FAVICON_32_ASSET_PATH,
    file: OPENAPI_FAVICON_32_ASSET_FILE,
    contentType: 'image/png',
    filename: 'favicon-32x32.png',
  },
  {
    path: OPENAPI_FAVICON_16_ASSET_PATH,
    file: OPENAPI_FAVICON_16_ASSET_FILE,
    contentType: 'image/png',
    filename: 'favicon-16x16.png',
  },
  {
    path: OPENAPI_FAVICON_ICO_ASSET_PATH,
    file: OPENAPI_FAVICON_ICO_ASSET_FILE,
    contentType: 'image/x-icon',
    filename: 'favicon.ico',
  },
  {
    path: OPENAPI_WEBMANIFEST_ASSET_PATH,
    file: OPENAPI_WEBMANIFEST_ASSET_FILE,
    contentType: 'application/manifest+json; charset=utf-8',
    filename: 'site.webmanifest',
  },
  {
    path: OPENAPI_ANDROID_192_ASSET_PATH,
    file: OPENAPI_ANDROID_192_ASSET_FILE,
    contentType: 'image/png',
    filename: 'android-chrome-192x192.png',
  },
  {
    path: OPENAPI_ANDROID_512_ASSET_PATH,
    file: OPENAPI_ANDROID_512_ASSET_FILE,
    contentType: 'image/png',
    filename: 'android-chrome-512x512.png',
  },
] as const;
const DOCS_HTML_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const DOCS_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const DOCS_ASSET_ERROR_CACHE_CONTROL = 'no-store';

interface OpenAPIDocsHtmlCacheEntry {
  html: string;
  gzip: Uint8Array;
  etag: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardPatternToRegex(pattern: string): RegExp {
  let regexSource = '^';
  for (const char of pattern) {
    if (char === '*') {
      regexSource += '.*';
      continue;
    }
    regexSource += escapeRegex(char);
  }
  regexSource += '$';
  return new RegExp(regexSource);
}

function matchesExposePath(path: string, exposePathPattern: string): boolean {
  if (!exposePathPattern.includes('*')) {
    return path === exposePathPattern;
  }
  return wildcardPatternToRegex(exposePathPattern).test(path);
}

export class VectorServer<TTypes extends VectorTypes = DefaultVectorTypes> {
  private server: Server | null = null;
  private router: VectorRouter<TTypes>;
  private config: VectorConfig<TTypes>;
  private openapiConfig: NormalizedOpenAPIConfig;
  private openapiDocCache: Record<string, unknown> | null = null;
  private openapiDocsHtmlCache: OpenAPIDocsHtmlCacheEntry | null = null;
  private openapiWarningsLogged = false;
  private openapiTailwindMissingLogged = false;
  private openapiLogoDarkMissingLogged = false;
  private openapiLogoWhiteMissingLogged = false;
  private corsHandler: {
    preflight: (request: Request) => Response;
    corsify: (response: Response, request: Request) => Response;
  } | null = null;
  private corsHeadersEntries: [string, string][] | null = null;

  constructor(router: VectorRouter<TTypes>, config: VectorConfig<TTypes>) {
    this.router = router;
    this.config = config;
    this.openapiConfig = this.normalizeOpenAPIConfig(config.openapi, config.development);

    if (config.cors) {
      const opts = this.normalizeCorsOptions(config.cors);
      const { preflight, corsify } = cors(opts);
      this.corsHandler = { preflight, corsify };

      // Pre-build static CORS headers when origin does not require per-request reflection.
      const canUseStaticCorsHeaders = typeof opts.origin === 'string' && (opts.origin !== '*' || !opts.credentials);

      if (canUseStaticCorsHeaders) {
        const corsHeaders: Record<string, string> = {
          'access-control-allow-origin': opts.origin,
          'access-control-allow-methods': opts.allowMethods,
          'access-control-allow-headers': opts.allowHeaders,
          'access-control-expose-headers': opts.exposeHeaders,
          'access-control-max-age': String(opts.maxAge),
        };
        if (opts.credentials) {
          corsHeaders['access-control-allow-credentials'] = 'true';
        }
        this.corsHeadersEntries = Object.entries(corsHeaders);
      }

      // Pass CORS behavior to router so matched routes also receive CORS headers.
      this.router.setCorsHeaders(this.corsHeadersEntries);
      this.router.setCorsHandler(this.corsHeadersEntries ? null : this.corsHandler.corsify);
    }
  }

  private normalizeOpenAPIConfig(
    openapi: OpenAPIOptions | boolean | undefined,
    development: boolean | undefined
  ): NormalizedOpenAPIConfig {
    const isDev = development !== false && process.env.NODE_ENV !== 'production';
    const defaultEnabled = isDev;

    if (openapi === false) {
      return {
        enabled: false,
        path: '/openapi.json',
        target: 'openapi-3.0',
        docs: { enabled: false, path: '/docs' },
      };
    }

    if (openapi === true) {
      return {
        enabled: true,
        path: '/openapi.json',
        target: 'openapi-3.0',
        docs: { enabled: false, path: '/docs' },
      };
    }

    const openapiObject = openapi || {};
    const docsValue = openapiObject.docs;
    const docs =
      typeof docsValue === 'boolean'
        ? { enabled: docsValue, path: '/docs', exposePaths: undefined }
        : {
            enabled: docsValue?.enabled === true,
            path: docsValue?.path || '/docs',
            exposePaths: Array.isArray(docsValue?.exposePaths)
              ? docsValue.exposePaths
                  .map((path) => (typeof path === 'string' ? path.trim() : ''))
                  .filter((path) => path.length > 0)
              : undefined,
          };

    return {
      enabled: openapiObject.enabled ?? defaultEnabled,
      path: openapiObject.path || '/openapi.json',
      target: openapiObject.target || 'openapi-3.0',
      docs,
      info: openapiObject.info,
    };
  }

  private isDocsReservedPath(path: string): boolean {
    return (
      path === this.openapiConfig.path || (this.openapiConfig.docs.enabled && path === this.openapiConfig.docs.path)
    );
  }

  private getOpenAPIDocument(): Record<string, unknown> {
    if (this.openapiDocCache) {
      return this.openapiDocCache;
    }

    const routes = this.router.getRouteDefinitions().filter((route) => !this.isDocsReservedPath(route.path));

    const result = generateOpenAPIDocument(routes as any, {
      target: this.openapiConfig.target,
      info: this.openapiConfig.info,
    });

    if (!this.openapiWarningsLogged && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(warning);
      }
      this.openapiWarningsLogged = true;
    }

    this.openapiDocCache = result.document;
    return this.openapiDocCache;
  }

  private getOpenAPIDocumentForDocs(): Record<string, unknown> {
    const exposePaths = this.openapiConfig.docs.exposePaths;
    const document = this.getOpenAPIDocument();

    if (!Array.isArray(exposePaths) || exposePaths.length === 0) {
      return document;
    }

    const existingPaths =
      document.paths && typeof document.paths === 'object' && !Array.isArray(document.paths)
        ? (document.paths as Record<string, unknown>)
        : {};

    const filteredPaths: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(existingPaths)) {
      if (exposePaths.some((pattern) => matchesExposePath(path, pattern))) {
        filteredPaths[path] = value;
      }
    }

    return {
      ...document,
      paths: filteredPaths,
    };
  }

  private getOpenAPIDocsHtmlCacheEntry(): OpenAPIDocsHtmlCacheEntry {
    if (this.openapiDocsHtmlCache) {
      return this.openapiDocsHtmlCache;
    }

    const html = renderOpenAPIDocsHtml(
      this.getOpenAPIDocumentForDocs(),
      this.openapiConfig.path,
      OPENAPI_TAILWIND_ASSET_PATH,
      OPENAPI_LOGO_DARK_ASSET_PATH,
      OPENAPI_LOGO_WHITE_ASSET_PATH,
      OPENAPI_APPLE_TOUCH_ICON_ASSET_PATH,
      OPENAPI_FAVICON_32_ASSET_PATH,
      OPENAPI_FAVICON_16_ASSET_PATH,
      OPENAPI_WEBMANIFEST_ASSET_PATH
    );
    const gzip = Bun.gzipSync(html);
    const etag = `"${Bun.hash(html).toString(16)}"`;

    this.openapiDocsHtmlCache = { html, gzip, etag };
    return this.openapiDocsHtmlCache;
  }

  private requestAcceptsGzip(request: Request): boolean {
    const acceptEncoding = request.headers.get('accept-encoding');
    return Boolean(acceptEncoding && /\bgzip\b/i.test(acceptEncoding));
  }

  private validateReservedOpenAPIPaths(): void {
    if (!this.openapiConfig.enabled) {
      return;
    }

    const reserved = new Set<string>([this.openapiConfig.path]);
    if (this.openapiConfig.docs.enabled) {
      reserved.add(this.openapiConfig.docs.path);
      reserved.add(OPENAPI_TAILWIND_ASSET_PATH);
      reserved.add(OPENAPI_LOGO_DARK_ASSET_PATH);
      reserved.add(OPENAPI_LOGO_WHITE_ASSET_PATH);
      for (const asset of OPENAPI_FAVICON_ASSETS) {
        reserved.add(asset.path);
      }
    }

    const methodConflicts = this.router
      .getRouteDefinitions()
      .filter((route) => reserved.has(route.path))
      .map((route) => `${route.method} ${route.path}`);

    const staticConflicts = Object.entries(this.router.getRouteTable())
      .filter(([path, value]) => reserved.has(path) && value instanceof Response)
      .map(([path]) => `STATIC ${path}`);

    const conflicts = [...methodConflicts, ...staticConflicts];

    if (conflicts.length > 0) {
      throw new Error(
        `OpenAPI reserved path conflict: ${conflicts.join(
          ', '
        )}. Change your route path(s) or reconfigure openapi.path/docs.path.`
      );
    }
  }

  private tryHandleOpenAPIRequest(request: Request): Response | null {
    if (!this.openapiConfig.enabled || request.method !== 'GET') {
      return null;
    }

    const pathname = new URL(request.url).pathname;
    if (pathname === this.openapiConfig.path) {
      return Response.json(this.getOpenAPIDocument());
    }

    if (this.openapiConfig.docs.enabled && pathname === this.openapiConfig.docs.path) {
      const { html, gzip, etag } = this.getOpenAPIDocsHtmlCacheEntry();
      if (request.headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: {
            etag,
            'cache-control': DOCS_HTML_CACHE_CONTROL,
            vary: 'accept-encoding',
          },
        });
      }

      if (this.requestAcceptsGzip(request)) {
        return new Response(gzip, {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-encoding': 'gzip',
            etag,
            'cache-control': DOCS_HTML_CACHE_CONTROL,
            vary: 'accept-encoding',
          },
        });
      }

      return new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          etag,
          'cache-control': DOCS_HTML_CACHE_CONTROL,
          vary: 'accept-encoding',
        },
      });
    }

    if (this.openapiConfig.docs.enabled && pathname === OPENAPI_TAILWIND_ASSET_PATH) {
      if (!OPENAPI_TAILWIND_ASSET_FILE) {
        if (!this.openapiTailwindMissingLogged) {
          this.openapiTailwindMissingLogged = true;
          console.warn(
            '[OpenAPI] Missing docs runtime asset "tailwindcdn.js". Serving inline fallback script instead.'
          );
        }

        return new Response(OPENAPI_TAILWIND_ASSET_INLINE_FALLBACK, {
          status: 200,
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': DOCS_ASSET_CACHE_CONTROL,
          },
        });
      }

      return new Response(OPENAPI_TAILWIND_ASSET_FILE, {
        status: 200,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': DOCS_ASSET_CACHE_CONTROL,
        },
      });
    }

    if (this.openapiConfig.docs.enabled && pathname === OPENAPI_LOGO_DARK_ASSET_PATH) {
      if (!OPENAPI_LOGO_DARK_ASSET_FILE) {
        if (!this.openapiLogoDarkMissingLogged) {
          this.openapiLogoDarkMissingLogged = true;
          console.warn('[OpenAPI] Missing docs runtime asset "logo_dark.svg".');
        }

        return new Response('OpenAPI docs runtime asset missing: logo_dark.svg', {
          status: 404,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': DOCS_ASSET_ERROR_CACHE_CONTROL,
          },
        });
      }

      return new Response(OPENAPI_LOGO_DARK_ASSET_FILE, {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': DOCS_ASSET_CACHE_CONTROL,
        },
      });
    }

    if (this.openapiConfig.docs.enabled && pathname === OPENAPI_LOGO_WHITE_ASSET_PATH) {
      if (!OPENAPI_LOGO_WHITE_ASSET_FILE) {
        if (!this.openapiLogoWhiteMissingLogged) {
          this.openapiLogoWhiteMissingLogged = true;
          console.warn('[OpenAPI] Missing docs runtime asset "logo_white.svg".');
        }

        return new Response('OpenAPI docs runtime asset missing: logo_white.svg', {
          status: 404,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': DOCS_ASSET_ERROR_CACHE_CONTROL,
          },
        });
      }

      return new Response(OPENAPI_LOGO_WHITE_ASSET_FILE, {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': DOCS_ASSET_CACHE_CONTROL,
        },
      });
    }

    if (this.openapiConfig.docs.enabled) {
      const faviconAsset = OPENAPI_FAVICON_ASSETS.find((asset) => asset.path === pathname);
      if (faviconAsset) {
        if (!faviconAsset.file) {
          return new Response(`OpenAPI docs runtime asset missing: ${faviconAsset.filename}`, {
            status: 404,
            headers: {
              'content-type': 'text/plain; charset=utf-8',
              'cache-control': DOCS_ASSET_ERROR_CACHE_CONTROL,
            },
          });
        }

        return new Response(faviconAsset.file, {
          status: 200,
          headers: {
            'content-type': faviconAsset.contentType,
            'cache-control': DOCS_ASSET_CACHE_CONTROL,
          },
        });
      }
    }

    return null;
  }

  private normalizeCorsOptions(options: CorsOptions): any {
    return {
      origin: options.origin || '*',
      credentials: options.credentials !== false,
      allowHeaders: Array.isArray(options.allowHeaders)
        ? options.allowHeaders.join(', ')
        : options.allowHeaders || 'Content-Type, Authorization',
      allowMethods: Array.isArray(options.allowMethods)
        ? options.allowMethods.join(', ')
        : options.allowMethods || 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      exposeHeaders: Array.isArray(options.exposeHeaders)
        ? options.exposeHeaders.join(', ')
        : options.exposeHeaders || 'Authorization',
      maxAge: options.maxAge || 86400,
    };
  }

  private applyCors(response: Response, request?: Request): Response {
    if (this.corsHeadersEntries) {
      for (const [k, v] of this.corsHeadersEntries) {
        response.headers.set(k, v);
      }
      return response;
    }

    if (this.corsHandler && request) {
      return this.corsHandler.corsify(response, request);
    }

    return response;
  }

  async start(): Promise<Server> {
    const port = this.config.port ?? 3000;
    const hostname = this.config.hostname || 'localhost';

    this.validateReservedOpenAPIPaths();

    const fallbackFetch = async (request: Request): Promise<Response> => {
      try {
        // Handle CORS preflight for any path
        if (this.corsHandler && request.method === 'OPTIONS') {
          return this.corsHandler.preflight(request);
        }

        // Handle built-in docs endpoints for requests that fell through the Bun route table.
        const openapiResponse = this.tryHandleOpenAPIRequest(request);
        if (openapiResponse) {
          return this.applyCors(openapiResponse, request);
        }

        // No route matched — return 404
        return this.applyCors(STATIC_RESPONSES.NOT_FOUND.clone() as unknown as Response, request);
      } catch (error) {
        console.error('Server error:', error);
        return this.applyCors(new Response('Internal Server Error', { status: 500 }), request);
      }
    };

    try {
      this.server = Bun.serve({
        port,
        hostname,
        reusePort: this.config.reusePort !== false,
        routes: this.router.getRouteTable(),
        fetch: fallbackFetch,
        idleTimeout: this.config.idleTimeout || 60,
        error: (error, request?: Request) => {
          console.error('[ERROR] Server error:', error);
          return this.applyCors(new Response('Internal Server Error', { status: 500 }), request);
        },
      });

      if (!this.server || !this.server.port) {
        throw new Error(`Failed to start server on ${hostname}:${port} - server object is invalid`);
      }

      return this.server;
    } catch (error: any) {
      if (error.code === 'EADDRINUSE' || error.message?.includes('address already in use')) {
        error.message = `Port ${port} is already in use`;
        error.port = port;
      } else if (error.code === 'EACCES' || error.message?.includes('permission denied')) {
        error.message = `Permission denied to bind to port ${port}`;
        error.port = port;
      } else if (error.message?.includes('EADDRNOTAVAIL')) {
        error.message = `Cannot bind to hostname ${hostname}`;
        error.hostname = hostname;
      }

      throw error;
    }
  }

  stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
      this.openapiDocCache = null;
      this.openapiDocsHtmlCache = null;
      this.openapiWarningsLogged = false;
      console.log('Server stopped');
    }
  }

  getServer(): Server | null {
    return this.server;
  }

  getPort(): number {
    return this.server?.port ?? this.config.port ?? 3000;
  }

  getHostname(): string {
    return this.server?.hostname || this.config.hostname || 'localhost';
  }

  getUrl(): string {
    const port = this.getPort();
    const hostname = this.getHostname();
    return `http://${hostname}:${port}`;
  }
}
