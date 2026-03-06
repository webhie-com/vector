import type { AuthManager } from '../auth/protected';
import type { CacheManager } from '../cache/manager';
import { APIError, createResponse } from '../http';
import type { MiddlewareManager } from '../middleware/manager';
import { STATIC_RESPONSES } from '../constants';
import { buildRouteRegex } from '../utils/path';
import type {
  BunMethodMap,
  BunRouteTable,
  DefaultVectorTypes,
  RouteHandler,
  RouteOptions,
  VectorRequest,
  VectorTypes,
} from '../types';

export class VectorRouter<TTypes extends VectorTypes = DefaultVectorTypes> {
  private middlewareManager: MiddlewareManager<TTypes>;
  private authManager: AuthManager<TTypes>;
  private cacheManager: CacheManager<TTypes>;
  private routeTable: BunRouteTable = {};
  private corsHeadersEntries: [string, string][] | null = null;

  constructor(
    middlewareManager: MiddlewareManager<TTypes>,
    authManager: AuthManager<TTypes>,
    cacheManager: CacheManager<TTypes>
  ) {
    this.middlewareManager = middlewareManager;
    this.authManager = authManager;
    this.cacheManager = cacheManager;
  }

  setCorsHeaders(entries: [string, string][] | null): void {
    this.corsHeadersEntries = entries;
  }

  route(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>): void {
    const method = options.method.toUpperCase();
    const path = options.path;
    const wrappedHandler = this.wrapHandler(options, handler);

    if (!this.routeTable[path]) {
      this.routeTable[path] = {};
    }
    (this.routeTable[path] as BunMethodMap)[method] = wrappedHandler;
  }

  addRoute(entry: [string, RegExp, any[], string?]): void {
    const [method, , handlers, path] = entry;
    if (!path) return;

    if (!this.routeTable[path]) {
      this.routeTable[path] = {};
    }
    (this.routeTable[path] as BunMethodMap)[method.toUpperCase()] = handlers[0];
  }

  bulkAddRoutes(entries: [string, RegExp, any[], string?][]): void {
    for (const entry of entries) {
      this.addRoute(entry);
    }
  }

  addStaticRoute(path: string, response: Response): void {
    this.routeTable[path] = response;
  }

  getRouteTable(): BunRouteTable {
    return this.routeTable;
  }

  // Legacy compatibility: returns route entries in a flat list for tests
  getRoutes(): [string, RegExp, any[], string][] {
    const result: [string, RegExp, any[], string][] = [];
    for (const [path, value] of Object.entries(this.routeTable)) {
      if (value instanceof Response) continue;
      for (const [method, handler] of Object.entries(value as BunMethodMap)) {
        result.push([method, /.*/, [handler], path]);
      }
    }
    return result;
  }

  clearRoutes(): void {
    this.routeTable = {};
  }

  // Legacy shim — no-op (Bun handles route priority natively)
  sortRoutes(): void {}

  // Compatibility handle() for unit tests — mirrors Bun's native routing without a server
  async handle(request: Request): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return APIError.badRequest('Malformed request URL');
    }
    (request as any)._parsedUrl = url;
    const pathname = url.pathname;

    for (const [path, value] of Object.entries(this.routeTable)) {
      if (value instanceof Response) continue;
      const methodMap = value as BunMethodMap;
      if (request.method === 'OPTIONS' || request.method in methodMap) {
        const regex = buildRouteRegex(path);
        const match = pathname.match(regex);
        if (match) {
          (request as any).params = match.groups ?? {};
          const handler = methodMap[request.method] ?? methodMap['GET'];
          if (handler) {
            const response = await handler(request);
            if (response) return response;
          }
        }
      }
    }

    return STATIC_RESPONSES.NOT_FOUND.clone();
  }

  private prepareRequest(
    request: VectorRequest<TTypes>,
    options?: {
      params?: Record<string, string>;
      route?: string;
      metadata?: any;
    }
  ): void {
    if (!request.context) {
      request.context = {} as any;
    }

    if (options?.params !== undefined && request.params === undefined) {
      try {
        request.params = options.params;
      } catch {
        // params is readonly (set by Bun natively) — use as-is
      }
    }
    if (options?.route !== undefined) {
      request.route = options.route;
    }
    if (options?.metadata !== undefined) {
      request.metadata = options.metadata;
    }

    if (!request.query && request.url) {
      const url = (request as any)._parsedUrl ?? new URL(request.url);
      const query: Record<string, string | string[]> = {};
      for (const [key, value] of url.searchParams) {
        if (key in query) {
          if (Array.isArray(query[key])) {
            (query[key] as string[]).push(value);
          } else {
            query[key] = [query[key] as string, value];
          }
        } else {
          query[key] = value;
        }
      }
      request.query = query;
    }

    if (!Object.getOwnPropertyDescriptor(request, 'cookies')) {
      Object.defineProperty(request, 'cookies', {
        get() {
          const cookieHeader = this.headers.get('cookie') ?? '';
          const cookies: Record<string, string> = {};
          if (cookieHeader) {
            for (const pair of cookieHeader.split(';')) {
              const idx = pair.indexOf('=');
              if (idx > 0) {
                cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
              }
            }
          }
          Object.defineProperty(this, 'cookies', {
            value: cookies,
            writable: true,
            configurable: true,
            enumerable: true,
          });
          return cookies;
        },
        configurable: true,
        enumerable: true,
      });
    }
  }

  private wrapHandler(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>) {
    const routePath = options.path;
    const corsEntries = () => this.corsHeadersEntries;

    return async (request: Request) => {
      const vectorRequest = request as VectorRequest<TTypes>;

      this.prepareRequest(vectorRequest, {
        route: routePath,
        metadata: options.metadata,
      });

      try {
        if (options.expose === false) {
          return APIError.forbidden('Forbidden');
        }

        const beforeResult = await this.middlewareManager.executeBefore(vectorRequest);
        if (beforeResult instanceof Response) {
          return beforeResult;
        }
        const req = beforeResult as VectorRequest<TTypes>;

        if (options.auth) {
          try {
            await this.authManager.authenticate(req);
          } catch (error) {
            return APIError.unauthorized(
              error instanceof Error ? error.message : 'Authentication failed',
              options.responseContentType
            );
          }
        }

        if (!options.rawRequest && req.method !== 'GET' && req.method !== 'HEAD') {
          try {
            const contentType = req.headers.get('content-type');
            if (contentType?.startsWith('application/json')) {
              req.content = await req.json();
            } else if (contentType?.startsWith('application/x-www-form-urlencoded')) {
              req.content = Object.fromEntries(await req.formData());
            } else if (contentType?.startsWith('multipart/form-data')) {
              req.content = await req.formData();
            } else {
              req.content = await req.text();
            }
          } catch {
            req.content = null;
          }
        }

        let result;
        const cacheOptions = options.cache;

        if (cacheOptions && typeof cacheOptions === 'number' && cacheOptions > 0) {
          const cacheKey = this.cacheManager.generateKey(req as any, {
            authUser: req.authUser,
          });
          result = await this.cacheManager.get(
            cacheKey,
            async () => {
              const res = await handler(req);
              if (res instanceof Response) {
                return {
                  _isResponse: true,
                  body: await res.text(),
                  status: res.status,
                  headers: Object.fromEntries(res.headers.entries()),
                };
              }
              return res;
            },
            cacheOptions
          );
        } else if (cacheOptions && typeof cacheOptions === 'object' && cacheOptions.ttl) {
          const cacheKey =
            cacheOptions.key ||
            this.cacheManager.generateKey(req as any, {
              authUser: req.authUser,
            });
          result = await this.cacheManager.get(
            cacheKey,
            async () => {
              const res = await handler(req);
              if (res instanceof Response) {
                return {
                  _isResponse: true,
                  body: await res.text(),
                  status: res.status,
                  headers: Object.fromEntries(res.headers.entries()),
                };
              }
              return res;
            },
            cacheOptions.ttl
          );
        } else {
          result = await handler(req);
        }

        if (result && typeof result === 'object' && result._isResponse === true) {
          result = new Response(result.body, {
            status: result.status,
            headers: result.headers,
          });
        }

        let response: Response;
        if (options.rawResponse || result instanceof Response) {
          response = result instanceof Response ? result : new Response(result);
        } else {
          response = createResponse(200, result, options.responseContentType);
        }

        response = await this.middlewareManager.executeFinally(response, req);

        // Apply pre-built CORS headers if configured
        const entries = corsEntries();
        if (entries) {
          for (const [k, v] of entries) {
            response.headers.set(k, v);
          }
        }

        return response;
      } catch (error) {
        if (error instanceof Response) {
          return error;
        }

        console.error('Route handler error:', error);
        return APIError.internalServerError(
          error instanceof Error ? error.message : String(error),
          options.responseContentType
        );
      }
    };
  }
}

export { STATIC_RESPONSES };
