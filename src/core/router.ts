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
  RouteBooleanDefaults,
  LegacyRouteEntry,
  RouteHandler,
  RouteOptions,
  VectorRequest,
  VectorTypes,
} from '../types';
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

interface RouteMatcher {
  path: string;
  regex: RegExp;
  specificity: number;
}

export class VectorRouter<TTypes extends VectorTypes = DefaultVectorTypes> {
  private middlewareManager: MiddlewareManager<TTypes>;
  private authManager: AuthManager<TTypes>;
  private cacheManager: CacheManager<TTypes>;
  private routeBooleanDefaults: RouteBooleanDefaults = {};
  private routeTable: BunRouteTable = Object.create(null) as BunRouteTable;
  private routeMatchers: RouteMatcher[] = [];
  private corsHeadersEntries: [string, string][] | null = null;
  private corsHandler: ((response: Response, request: Request) => Response) | null = null;

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

  setCorsHandler(handler: ((response: Response, request: Request) => Response) | null): void {
    this.corsHandler = handler;
  }

  route(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>): void {
    const method = options.method.toUpperCase();
    const path = options.path;
    const wrappedHandler = this.wrapHandler(options, handler);
    const methodMap = this.getOrCreateMethodMap(path);
    methodMap[method] = wrappedHandler;
  }

  addRoute(entry: LegacyRouteEntry): void {
    const [method, , handlers, path] = entry;
    if (!path) return;
    const methodMap = this.getOrCreateMethodMap(path);
    methodMap[method.toUpperCase()] = handlers[0];
  }

  bulkAddRoutes(entries: LegacyRouteEntry[]): void {
    for (const entry of entries) {
      this.addRoute(entry);
    }
  }

  addStaticRoute(path: string, response: Response): void {
    const existing = this.routeTable[path];
    if (existing && !(existing instanceof Response)) {
      throw new Error(
        `Cannot register static route for path "${path}" because method routes already exist.`
      );
    }
    this.routeTable[path] = response;
    this.removeRouteMatcher(path);
  }

  getRouteTable(): BunRouteTable {
    return this.routeTable;
  }

  // Legacy compatibility: returns route entries in a flat list for tests
  getRoutes(): LegacyRouteEntry[] {
    const result: LegacyRouteEntry[] = [];
    for (const [path, value] of Object.entries(this.routeTable)) {
      if (value instanceof Response) continue;
      for (const [method, handler] of Object.entries(value as BunMethodMap)) {
        result.push([method, /.*/, [handler], path]);
      }
    }
    return result;
  }

  clearRoutes(): void {
    this.routeTable = Object.create(null) as BunRouteTable;
    this.routeMatchers = [];
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

    for (const matcher of this.routeMatchers) {
      const path = matcher.path;
      const value = this.routeTable[path];
      if (!value) continue;
      if (value instanceof Response) continue;
      const methodMap = value as BunMethodMap;
      if (request.method === 'OPTIONS' || request.method in methodMap) {
        const match = pathname.match(matcher.regex);
        if (match) {
          try {
            (request as any).params = match.groups ?? {};
          } catch {
            // Request.params can be readonly on Bun-native requests.
          }
          const handler = methodMap[request.method] ?? methodMap['GET'];
          if (handler) {
            const response = await handler(request);
            if (response) return response;
          }
        }
      }
    }

    return STATIC_RESPONSES.NOT_FOUND.clone() as unknown as Response;
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
    const corsHandler = () => this.corsHandler;

    return async (request: Request) => {
      const vectorRequest = request as unknown as VectorRequest<TTypes>;

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
        } else {
          const dynamicCors = corsHandler();
          if (dynamicCors) {
            response = dynamicCors(response, req as unknown as Request);
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
  

  private getOrCreateMethodMap(path: string): BunMethodMap {
    const existing = this.routeTable[path];
    if (existing instanceof Response) {
      throw new Error(
        `Cannot register method route for path "${path}" because a static route already exists.`
      );
    }
    if (existing) {
      return existing as BunMethodMap;
    }

    const methodMap = Object.create(null) as BunMethodMap;
    this.routeTable[path] = methodMap;
    this.addRouteMatcher(path);
    return methodMap;
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
}

  private addRouteMatcher(path: string): void {
    if (this.routeMatchers.some((matcher) => matcher.path === path)) {
      return;

    }

    this.routeMatchers.push({
      path,
      regex: buildRouteRegex(path),
      specificity: this.routeSpecificityScore(path),
    });

    this.routeMatchers.sort((a, b) => {
      if (a.specificity !== b.specificity) {
        return b.specificity - a.specificity;
      }
      return a.path.localeCompare(b.path);
    });
  }

  private removeRouteMatcher(path: string): void {
    this.routeMatchers = this.routeMatchers.filter((matcher) => matcher.path !== path);
  }

  clearRoutes(): void {
    this.routes = [];
    this.routeDefinitions = [];
    this.specificityCache.clear();
  }

  private routeSpecificityScore(path: string): number {
    const segments = path.split('/').filter(Boolean);
    let staticSegments = 0;
    let paramSegments = 0;
    let wildcardSegments = 0;
    let literalLength = 0;

    for (const segment of segments) {
      if (segment.includes('*')) {
        wildcardSegments++;
      } else if (segment.startsWith(':')) {
        paramSegments++;
      } else {
        staticSegments++;
        literalLength += segment.length;
      }
    }

    return (
      staticSegments * 10_000 +
      literalLength * 100 +
      segments.length * 10 -
      paramSegments * 5_000 -
      wildcardSegments * 20_000
    );
  }
}
