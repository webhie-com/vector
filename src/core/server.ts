import type { Server } from 'bun';
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
  };
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
}

export class VectorServer<TTypes extends VectorTypes = DefaultVectorTypes> {
  private server: Server | null = null;
  private router: VectorRouter<TTypes>;
  private config: VectorConfig<TTypes>;
  private openapiConfig: NormalizedOpenAPIConfig;
  private openapiDocCache: Record<string, unknown> | null = null;
  private openapiWarningsLogged = false;
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
      const canUseStaticCorsHeaders =
        typeof opts.origin === 'string' && (opts.origin !== '*' || !opts.credentials);

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
        ? { enabled: docsValue, path: '/docs' }
        : {
            enabled: docsValue?.enabled === true,
            path: docsValue?.path || '/docs',
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

  private tryHandleOpenAPIRequest(request: Request): Response | null {
    if (!this.openapiConfig.enabled || request.method !== 'GET') {
      return null;
    }

    const pathname = new URL(request.url).pathname;
    if (pathname === this.openapiConfig.path) {
      return Response.json(this.getOpenAPIDocument());
    }

    if (this.openapiConfig.docs.enabled && pathname === this.openapiConfig.docs.path) {
      return new Response(renderOpenAPIDocsHtml(this.getOpenAPIDocument(), this.openapiConfig.path), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
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

    const fallbackFetch = async (request: Request): Promise<Response> => {
      try {
        // Handle CORS preflight for any path
        if (this.corsHandler && request.method === 'OPTIONS') {
          return this.corsHandler.preflight(request);
        }

        // Built-in docs endpoints are handled before user routes to avoid conflicts
        let response = this.tryHandleOpenAPIRequest(request) || (await this.router.handle(request));

        // Apply CORS headers if configured
        if (this.corsHeaders) {
          for (const [k, v] of this.corsHeadersEntries) {
            response.headers.set(k, v);
          }
        } else if (this.corsHandler) {
          response = this.corsHandler.corsify(response, request);
        }

        return response;
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
