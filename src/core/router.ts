import type { RouteEntry } from 'itty-router';
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

  private wrapHandler(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>) {
    return async (request: any) => {
      // Ensure request has required properties
      const vectorRequest = request as VectorRequest<TTypes>;

      // Initialize context if not present
      if (!vectorRequest.context) {
        vectorRequest.context = {} as any;
      }

      // Parse query parameters from URL (handles duplicate params as arrays)
      if (!vectorRequest.query && vectorRequest.url) {
        const url = new URL(vectorRequest.url);
        const query: Record<string, string | string[]> = {};
        for (let [k, v] of url.searchParams) {
          query[k] = query[k] ? ([] as string[]).concat(query[k], v) : v;
        }
        vectorRequest.query = query;
      }

      // Add metadata to request if provided
      if (options.metadata) {
        vectorRequest.metadata = options.metadata;
      }

      request = vectorRequest;
      try {
        if (!options.expose) {
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

        if (cacheOptions && typeof cacheOptions === 'number' && cacheOptions > 0) {
          const cacheKey = this.cacheManager.generateKey(request as any, {
            authUser: request.authUser,
          });
          result = await this.cacheManager.get(cacheKey, () => handler(request), cacheOptions);
        } else if (cacheOptions && typeof cacheOptions === 'object' && cacheOptions.ttl) {
          const cacheKey =
            cacheOptions.key ||
            this.cacheManager.generateKey(request as any, {
              authUser: request.authUser,
            });
          result = await this.cacheManager.get(cacheKey, () => handler(request), cacheOptions.ttl);
        } else {
          result = await handler(request);
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

    for (const [method, regex, handlers] of this.routes) {
      if (request.method === 'OPTIONS' || request.method === method) {
        const match = pathname.match(regex);
        if (match) {
          const req = request as any as VectorRequest<TTypes>;
          // Initialize context for new request
          if (!req.context) {
            req.context = {} as any;
          }
          req.params = match.groups || {};

          for (const handler of handlers) {
            const response = await handler(req as any);
            if (response) return response;
          }
        }
      }
    }

    return APIError.notFound('Route not found');
  }
}
