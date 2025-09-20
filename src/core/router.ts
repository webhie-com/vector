import type { RouteEntry } from 'itty-router';
import { withCookies } from 'itty-router';
import type { AuthManager } from '../auth/protected';
import type { CacheManager } from '../cache/manager';
import { APIError, createResponse } from '../http';
import type { MiddlewareManager } from '../middleware/manager';
import type {
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
  private routes: RouteEntry[] = [];

  constructor(
    middlewareManager: MiddlewareManager<TTypes>,
    authManager: AuthManager<TTypes>,
    cacheManager: CacheManager<TTypes>
  ) {
    this.middlewareManager = middlewareManager;
    this.authManager = authManager;
    this.cacheManager = cacheManager;
  }

  private getRouteSpecificity(path: string): number {
    const STATIC_SEGMENT_WEIGHT = 1000;
    const PARAM_SEGMENT_WEIGHT = 10;
    const WILDCARD_WEIGHT = 1;
    const EXACT_MATCH_BONUS = 10000;

    let score = 0;
    const segments = path.split('/').filter(Boolean);

    for (const segment of segments) {
      if (this.isStaticSegment(segment)) {
        score += STATIC_SEGMENT_WEIGHT;
      } else if (this.isParamSegment(segment)) {
        score += PARAM_SEGMENT_WEIGHT;
      } else if (this.isWildcardSegment(segment)) {
        score += WILDCARD_WEIGHT;
      }
    }

    score += path.length;

    if (this.isExactPath(path)) {
      score += EXACT_MATCH_BONUS;
    }

    return score;
  }

  private isStaticSegment(segment: string): boolean {
    return !segment.startsWith(':') && !segment.includes('*');
  }

  private isParamSegment(segment: string): boolean {
    return segment.startsWith(':');
  }

  private isWildcardSegment(segment: string): boolean {
    return segment.includes('*');
  }

  private isExactPath(path: string): boolean {
    return !path.includes(':') && !path.includes('*');
  }

  sortRoutes(): void {
    this.routes.sort((a, b) => {
      const pathA = this.extractPath(a);
      const pathB = this.extractPath(b);

      const scoreA = this.getRouteSpecificity(pathA);
      const scoreB = this.getRouteSpecificity(pathB);

      return scoreB - scoreA;
    });
  }

  private extractPath(route: RouteEntry): string {
    const PATH_INDEX = 3;
    return route[PATH_INDEX] || '';
  }

  route(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>): RouteEntry {
    const wrappedHandler = this.wrapHandler(options, handler);
    const routeEntry: RouteEntry = [
      options.method.toUpperCase(),
      this.createRouteRegex(options.path),
      [wrappedHandler],
      options.path,
    ];

    this.routes.push(routeEntry);
    this.sortRoutes(); // Sort routes after adding
    return routeEntry;
  }

  private createRouteRegex(path: string): RegExp {
    return RegExp(
      `^${path
        .replace(/\/+(\/|$)/g, '$1')
        .replace(/(\/?\.?):(\w+)\+/g, '($1(?<$2>*))')
        .replace(/(\/?\.?):(\w+)/g, '($1(?<$2>[^$1/]+?))')
        .replace(/\./g, '\\.')
        .replace(/(\/?)\*/g, '($1.*)?')}/*$`
    );
  }

  private prepareRequest(
    request: VectorRequest<TTypes>,
    options?: {
      params?: Record<string, string>;
      route?: string;
      metadata?: any;
    }
  ): void {
    // Initialize context if not present
    if (!request.context) {
      request.context = {} as any;
    }

    // Set params and route if provided
    if (options?.params !== undefined) {
      request.params = options.params;
    }
    if (options?.route !== undefined) {
      request.route = options.route;
    }
    if (options?.metadata !== undefined) {
      request.metadata = options.metadata;
    }

    // Parse query parameters from URL if not already parsed
    if (!request.query && request.url) {
      const url = new URL(request.url);
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

    // Parse cookies if not already parsed
    if (!request.cookies) {
      withCookies(request as any);
    }
  }

  private wrapHandler(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>) {
    return async (request: any) => {
      // Ensure request has required properties
      const vectorRequest = request as VectorRequest<TTypes>;

      // Prepare the request with common logic
      this.prepareRequest(vectorRequest, {
        metadata: options.metadata
      });

      request = vectorRequest;
      try {
        // Default expose to true if not specified
        if (options.expose === false) {
          return APIError.forbidden('Forbidden');
        }

        const beforeResult = await this.middlewareManager.executeBefore(request);
        if (beforeResult instanceof Response) {
          return beforeResult;
        }
        request = beforeResult as any;

        if (options.auth) {
          try {
            await this.authManager.authenticate(request);
          } catch (error) {
            return APIError.unauthorized(
              error instanceof Error ? error.message : 'Authentication failed',
              options.responseContentType
            );
          }
        }

        if (!options.rawRequest && request.method !== 'GET' && request.method !== 'HEAD') {
          try {
            const contentType = request.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              request.content = await request.json();
            } else if (contentType?.includes('application/x-www-form-urlencoded')) {
              request.content = Object.fromEntries(await request.formData());
            } else if (contentType?.includes('multipart/form-data')) {
              request.content = await request.formData();
            } else {
              request.content = await request.text();
            }
          } catch {
            request.content = null;
          }
        }

        let result;
        const cacheOptions = options.cache;

        // Create cache factory that handles Response objects
        const cacheFactory = async () => {
          const res = await handler(request);
          // If Response, extract data for caching
          if (res instanceof Response) {
            return {
              _isResponse: true,
              body: await res.text(),
              status: res.status,
              headers: Object.fromEntries(res.headers.entries())
            };
          }
          return res;
        };

        if (cacheOptions && typeof cacheOptions === 'number' && cacheOptions > 0) {
          const cacheKey = this.cacheManager.generateKey(request as any, {
            authUser: request.authUser,
          });
          result = await this.cacheManager.get(cacheKey, cacheFactory, cacheOptions);
        } else if (cacheOptions && typeof cacheOptions === 'object' && cacheOptions.ttl) {
          const cacheKey =
            cacheOptions.key ||
            this.cacheManager.generateKey(request as any, {
              authUser: request.authUser,
            });
          result = await this.cacheManager.get(cacheKey, cacheFactory, cacheOptions.ttl);
        } else {
          result = await handler(request);
        }

        // Reconstruct Response if it was cached
        if (result && typeof result === 'object' && result._isResponse === true) {
          result = new Response(result.body, {
            status: result.status,
            headers: result.headers
          });
        }

        let response: Response;
        if (options.rawResponse || result instanceof Response) {
          response = result instanceof Response ? result : new Response(result);
        } else {
          response = createResponse(200, result, options.responseContentType);
        }

        response = await this.middlewareManager.executeFinally(response, request);

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

  addRoute(routeEntry: RouteEntry) {
    this.routes.push(routeEntry);
    this.sortRoutes(); // Sort routes after adding a new one
  }

  getRoutes(): RouteEntry[] {
    return this.routes;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    for (const [method, regex, handlers, path] of this.routes) {
      if (request.method === 'OPTIONS' || request.method === method) {
        const match = pathname.match(regex);
        if (match) {
          const req = request as any as VectorRequest<TTypes>;

          // Prepare the request with common logic
          this.prepareRequest(req, {
            params: match.groups || {},
            route: path || pathname
          });

          for (const handler of handlers) {
            const response = await handler(req as any);
            if (response) return response;
          }
        }
      }
    }

    return APIError.notFound('Route not found');
  }

  clearRoutes(): void {
    this.routes = [];
  }
}
