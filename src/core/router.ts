import type { RouteEntry } from 'itty-router';
import type { AuthManager } from '../auth/protected';
import type { CacheManager } from '../cache/manager';
import { APIError, createResponse } from '../http';
import type { MiddlewareManager } from '../middleware/manager';
import type {
  DefaultVectorTypes,
  RouteBooleanDefaults,
  RouteHandler,
  RouteOptions,
  VectorRequest,
  VectorTypes,
} from '../types';
import { buildRouteRegex } from '../utils/path';
import {
  createValidationErrorPayload,
  extractThrownIssues,
  isStandardRouteSchema,
  normalizeValidationIssues,
  runStandardValidation,
} from '../utils/schema-validation';

export interface RegisteredRouteDefinition<TTypes extends VectorTypes = DefaultVectorTypes> {
  method: string;
  path: string;
  options: RouteOptions<TTypes>;
}

export class VectorRouter<TTypes extends VectorTypes = DefaultVectorTypes> {
  private middlewareManager: MiddlewareManager<TTypes>;
  private authManager: AuthManager<TTypes>;
  private cacheManager: CacheManager<TTypes>;
  private routes: RouteEntry[] = [];
  private routeDefinitions: RegisteredRouteDefinition<TTypes>[] = [];
  private specificityCache: Map<string, number> = new Map();
  private routeBooleanDefaults: RouteBooleanDefaults = {};

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
    const cached = this.specificityCache.get(path);
    if (cached !== undefined) return cached;

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

    this.specificityCache.set(path, score);
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
    const resolvedOptions: RouteOptions<TTypes> = this.applyRouteBooleanDefaults(options);
    const wrappedHandler = this.wrapHandler(resolvedOptions, handler);
    const routeEntry: RouteEntry = [
      resolvedOptions.method.toUpperCase(),
      this.createRouteRegex(resolvedOptions.path),
      [wrappedHandler],
      resolvedOptions.path,
    ];

    this.routes.push(routeEntry);
    this.routeDefinitions.push({
      method: resolvedOptions.method.toUpperCase(),
      path: resolvedOptions.path,
      options: resolvedOptions,
    });
    this.sortRoutes(); // Sort routes after adding
    return routeEntry;
  }

  setRouteBooleanDefaults(defaults?: RouteBooleanDefaults): void {
    this.routeBooleanDefaults = { ...defaults };
  }

  private applyRouteBooleanDefaults(options: RouteOptions<TTypes>): RouteOptions<TTypes> {
    const resolved = { ...options };
    const defaults = this.routeBooleanDefaults;

    const keys: (keyof RouteBooleanDefaults)[] = ['auth', 'expose', 'rawRequest', 'validateRawRequest', 'rawResponse'];

    for (const key of keys) {
      if (resolved[key] === undefined && defaults[key] !== undefined) {
        (resolved as any)[key] = defaults[key];
      }
    }

    return resolved;
  }

  private createRouteRegex(path: string): RegExp {
    return buildRouteRegex(path);
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

    // Lazy cookie parsing — only parse the Cookie header when first accessed
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
    return async (request: any) => {
      // Ensure request has required properties
      const vectorRequest = request as VectorRequest<TTypes>;

      // Prepare the request with common logic
      this.prepareRequest(vectorRequest, {
        metadata: options.metadata,
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
            this.setBodyAlias(request, request.content);
          } catch {
            request.content = null;
            this.setBodyAlias(request, null);
          }
        }

        const inputValidationResponse = await this.validateInputSchema(request, options);
        if (inputValidationResponse) {
          return inputValidationResponse;
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
              headers: Object.fromEntries(res.headers.entries()),
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
            headers: result.headers,
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

  private isDevelopmentMode(): boolean {
    const nodeEnv = typeof Bun !== 'undefined' ? Bun.env.NODE_ENV : process.env.NODE_ENV;
    return nodeEnv !== 'production';
  }

  private async buildInputValidationPayload(
    request: VectorRequest<TTypes>,
    options: RouteOptions<TTypes>
  ): Promise<Record<string, unknown>> {
    let body = request.content;

    if (
      options.rawRequest &&
      options.validateRawRequest !== false &&
      request.method !== 'GET' &&
      request.method !== 'HEAD'
    ) {
      try {
        body = await (request as unknown as Request).clone().text();
      } catch {
        body = null;
      }
    }

    return {
      params: request.params ?? {},
      query: request.query ?? {},
      headers: Object.fromEntries(request.headers.entries()),
      cookies: request.cookies ?? {},
      body,
    };
  }

  private applyValidatedInput(request: VectorRequest<TTypes>, validatedValue: unknown): void {
    request.validatedInput = validatedValue;

    if (!validatedValue || typeof validatedValue !== 'object') {
      return;
    }

    const validated = validatedValue as Record<string, unknown>;

    if ('params' in validated) {
      request.params = validated.params as any;
    }
    if ('query' in validated) {
      request.query = validated.query as any;
    }
    if ('cookies' in validated) {
      request.cookies = validated.cookies as any;
    }
    if ('body' in validated) {
      request.content = validated.body;
      this.setBodyAlias(request, validated.body);
    }
  }

  private setBodyAlias(request: VectorRequest<TTypes>, value: unknown): void {
    try {
      request.body = value as any;
    } catch {
      // Keep request.content as source of truth when body alias is readonly.
    }
  }

  private async validateInputSchema(
    request: VectorRequest<TTypes>,
    options: RouteOptions<TTypes>
  ): Promise<Response | null> {
    const inputSchema = options.schema?.input;

    if (!inputSchema) {
      return null;
    }

    if (options.rawRequest && options.validateRawRequest === false) {
      return null;
    }

    if (!isStandardRouteSchema(inputSchema)) {
      return APIError.internalServerError('Invalid route schema configuration', options.responseContentType);
    }

    const includeRawIssues = this.isDevelopmentMode();
    const payload = await this.buildInputValidationPayload(request, options);

    try {
      const validation = await runStandardValidation(inputSchema, payload);
      if (!validation.success) {
        const issues = normalizeValidationIssues(validation.issues, includeRawIssues);
        return createResponse(422, createValidationErrorPayload('input', issues), options.responseContentType);
      }

      this.applyValidatedInput(request, validation.value);
      return null;
    } catch (error) {
      const thrownIssues = extractThrownIssues(error);
      if (thrownIssues) {
        const issues = normalizeValidationIssues(thrownIssues, includeRawIssues);
        return createResponse(422, createValidationErrorPayload('input', issues), options.responseContentType);
      }

      return APIError.internalServerError(
        error instanceof Error ? error.message : 'Validation failed',
        options.responseContentType
      );
    }
  }

  addRoute(routeEntry: RouteEntry) {
    this.routes.push(routeEntry);
    const method = String(routeEntry[0] || '').toUpperCase();
    const path = String(routeEntry[3] || '');
    this.routeDefinitions.push({
      method,
      path,
      options: {
        method,
        path,
        expose: true,
      } as RouteOptions<TTypes>,
    });
    this.sortRoutes(); // Sort routes after adding a new one
  }

  bulkAddRoutes(entries: RouteEntry[]): void {
    for (const entry of entries) {
      this.routes.push(entry);
      const method = String(entry[0] || '').toUpperCase();
      const path = String(entry[3] || '');
      this.routeDefinitions.push({
        method,
        path,
        options: {
          method,
          path,
          expose: true,
        } as RouteOptions<TTypes>,
      });
    }
    this.sortRoutes(); // Sort once after all routes are added — O(n log n) instead of O(n²)
  }

  getRoutes(): RouteEntry[] {
    return this.routes;
  }

  getRouteDefinitions(): RegisteredRouteDefinition<TTypes>[] {
    return [...this.routeDefinitions];
  }

  async handle(request: Request): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return APIError.badRequest('Malformed request URL');
    }
    (request as any)._parsedUrl = url;
    const pathname = url.pathname;

    for (const [method, regex, handlers, path] of this.routes) {
      if (request.method === 'OPTIONS' || request.method === method) {
        const match = pathname.match(regex);
        if (match) {
          const req = request as any as VectorRequest<TTypes>;

          // Prepare the request with common logic
          this.prepareRequest(req, {
            params: match.groups || {},
            route: path || pathname,
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
    this.routeDefinitions = [];
    this.specificityCache.clear();
  }
}
