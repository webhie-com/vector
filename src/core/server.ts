import type { Server } from 'bun';
import { STATIC_RESPONSES } from '../constants';
import { cors } from '../utils/cors';
import type { CorsOptions, DefaultVectorTypes, VectorConfig, VectorTypes } from '../types';
import type { VectorRouter } from './router';

export class VectorServer<TTypes extends VectorTypes = DefaultVectorTypes> {
  private server: Server | null = null;
  private router: VectorRouter<TTypes>;
  private config: VectorConfig<TTypes>;
  private corsHandler: any;
  private corsHeadersEntries: [string, string][] | null = null;

  constructor(router: VectorRouter<TTypes>, config: VectorConfig<TTypes>) {
    this.router = router;
    this.config = config;

    if (config.cors) {
      const opts = this.normalizeCorsOptions(config.cors);
      const { preflight, corsify } = cors(opts);
      this.corsHandler = { preflight, corsify };

      // Pre-build static CORS headers when origin is a fixed string.
      if (typeof opts.origin === 'string') {
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

      // Pass CORS headers to router so wrapHandler can apply them per-response
      this.router.setCorsHeaders(this.corsHeadersEntries);
    }
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

  async start(): Promise<Server> {
    const port = this.config.port ?? 3000;
    const hostname = this.config.hostname || 'localhost';

    const fallbackFetch = async (request: Request): Promise<Response> => {
      try {
        // Handle CORS preflight for any path
        if (this.corsHandler && request.method === 'OPTIONS') {
          return this.corsHandler.preflight(request);
        }

        // No route matched — return 404
        return STATIC_RESPONSES.NOT_FOUND.clone() as unknown as Response;
      } catch (error) {
        console.error('Server error:', error);
        return new Response('Internal Server Error', { status: 500 });
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
        error: (error) => {
          console.error('[ERROR] Server error:', error);
          return new Response('Internal Server Error', { status: 500 });
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
