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
  InferRouteInputFromSchemaDefinition,
  RouteBooleanDefaults,
  LegacyRouteEntry,
  RouteHandler,
  RouteOptions,
  RouteSchemaDefinition,
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
  private developmentMode: boolean | undefined = undefined;
  private routeDefinitions: RegisteredRouteDefinition<TTypes>[] = [];
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

  setRouteBooleanDefaults(defaults?: RouteBooleanDefaults): void {
    this.routeBooleanDefaults = { ...defaults };
  }

  setDevelopmentMode(mode?: boolean): void {
    this.developmentMode = mode;
  }

  private applyRouteBooleanDefaults(options: RouteOptions<TTypes>): RouteOptions<TTypes> {
    const resolved = { ...options };
    const defaults = this.routeBooleanDefaults;

    const keys: (keyof RouteBooleanDefaults)[] = ['auth', 'expose', 'rawRequest', 'validate', 'rawResponse'];

    for (const key of keys) {
      if (resolved[key] === undefined && defaults[key] !== undefined) {
        (resolved as any)[key] = defaults[key];
      }
    }

    return resolved;
  }

  route<TSchemaDef extends RouteSchemaDefinition | undefined>(
    options: Omit<RouteOptions<TTypes>, 'schema'> & { schema?: TSchemaDef },
    handler: RouteHandler<TTypes, InferRouteInputFromSchemaDefinition<TSchemaDef>>
  ): void;
  route(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>): void {
    const resolvedOptions = this.applyRouteBooleanDefaults(options);
    const method = resolvedOptions.method.toUpperCase();
    const path = resolvedOptions.path;
    const wrappedHandler = this.wrapHandler(resolvedOptions, handler);
    const methodMap = this.getOrCreateMethodMap(path);
    methodMap[method] = wrappedHandler;

    this.routeDefinitions.push({
      method,
      path,
      options: resolvedOptions,
    });
  }

  addRoute(entry: LegacyRouteEntry): void {
    const [method, , handlers, path] = entry;
    if (!path) return;
    const methodMap = this.getOrCreateMethodMap(path);
    methodMap[method.toUpperCase()] = handlers[0];

    const normalizedMethod = method.toUpperCase();
    this.routeDefinitions.push({
      method: normalizedMethod,
      path,
      options: {
        method: normalizedMethod,
        path,
        expose: true,
      } as RouteOptions<TTypes>,
    });
  }

  bulkAddRoutes(entries: LegacyRouteEntry[]): void {
    for (const entry of entries) {
      this.addRoute(entry);
    }
  }

  addStaticRoute(path: string, response: Response): void {
    const existing = this.routeTable[path];
    if (existing && !(existing instanceof Response)) {
      throw new Error(`Cannot register static route for path "${path}" because method routes already exist.`);
    }
    this.routeTable[path] = response;
    this.removeRouteMatcher(path);
  }

  getRouteTable(): BunRouteTable {
    return this.routeTable;
  }

  // Legacy compatibility: returns route entries in a flat list for tests
  getRoutes(): LegacyRouteEntry[] {
    const routes: LegacyRouteEntry[] = [];
    for (const matcher of this.routeMatchers) {
      const value = this.routeTable[matcher.path];
      if (!value || value instanceof Response) continue;

      for (const [method, handler] of Object.entries(value as BunMethodMap)) {
        routes.push([method, matcher.regex, [handler], matcher.path]);
      }
    }
    return routes;
  }

  getRouteDefinitions(): RegisteredRouteDefinition<TTypes>[] {
    return [...this.routeDefinitions];
  }

  clearRoutes(): void {
    this.routeTable = Object.create(null) as BunRouteTable;
    this.routeMatchers = [];
    this.routeDefinitions = [];
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

    const hasEmptyParamsObject =
      !!request.params &&
      typeof request.params === 'object' &&
      !Array.isArray(request.params) &&
      Object.keys(request.params as Record<string, unknown>).length === 0;

    if (options?.params !== undefined && (request.params === undefined || hasEmptyParamsObject)) {
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

    if (request.query == null && request.url) {
      try {
        Object.defineProperty(request, 'query', {
          get() {
            const url = (this as any)._parsedUrl ?? new URL(this.url);
            const query = VectorRouter.parseQuery(url);
            Object.defineProperty(this, 'query', {
              value: query,
              writable: true,
              configurable: true,
              enumerable: true,
            });
            return query;
          },
          set(value) {
            Object.defineProperty(this, 'query', {
              value,
              writable: true,
              configurable: true,
              enumerable: true,
            });
          },
          configurable: true,
          enumerable: true,
        });
      } catch {
        const url = (request as any)._parsedUrl ?? new URL(request.url);
        try {
          request.query = VectorRouter.parseQuery(url);
        } catch {
          // Leave query as-is when request shape is non-extensible.
        }
      }
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

  private resolveFallbackParams(request: Request, routeMatcher: RegExp | null): Record<string, string> | undefined {
    if (!routeMatcher) {
      return undefined;
    }

    const currentParams = (request as any).params;
    if (
      currentParams &&
      typeof currentParams === 'object' &&
      !Array.isArray(currentParams) &&
      Object.keys(currentParams as Record<string, unknown>).length > 0
    ) {
      return undefined;
    }

    let pathname: string;
    try {
      pathname = ((request as any)._parsedUrl ?? new URL(request.url)).pathname;
    } catch {
      return undefined;
    }

    const matched = pathname.match(routeMatcher);
    if (!matched?.groups) {
      return undefined;
    }

    return matched.groups as Record<string, string>;
  }

  private wrapHandler(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>) {
    const routePath = options.path;
    const routeMatcher = routePath.includes(':') ? buildRouteRegex(routePath) : null;

    return async (request: Request) => {
      const vectorRequest = request as unknown as VectorRequest<TTypes>;
      const fallbackParams = this.resolveFallbackParams(request, routeMatcher);

      this.prepareRequest(vectorRequest, {
        params: fallbackParams,
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
          let parsedContent: unknown = null;
          try {
            const contentType = req.headers.get('content-type');
            if (contentType?.startsWith('application/json')) {
              parsedContent = await req.json();
            } else if (contentType?.startsWith('application/x-www-form-urlencoded')) {
              parsedContent = Object.fromEntries(await req.formData());
            } else if (contentType?.startsWith('multipart/form-data')) {
              parsedContent = await req.formData();
            } else {
              parsedContent = await req.text();
            }
          } catch {
            parsedContent = null;
          }
          this.setContentAndBodyAlias(req, parsedContent);
        }

        const inputValidationResponse = await this.validateInputSchema(req, options);
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
        const entries = this.corsHeadersEntries;
        if (entries) {
          for (const [k, v] of entries) {
            response.headers.set(k, v);
          }
        } else {
          const dynamicCors = this.corsHandler;
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
    if (this.developmentMode !== undefined) {
      return this.developmentMode;
    }

    const nodeEnv = typeof Bun !== 'undefined' ? Bun.env.NODE_ENV : process.env.NODE_ENV;
    return nodeEnv !== 'production';
  }

  private async buildInputValidationPayload(
    request: VectorRequest<TTypes>,
    options: RouteOptions<TTypes>
  ): Promise<Record<string, unknown>> {
    let body = request.content;

    if (options.rawRequest && request.method !== 'GET' && request.method !== 'HEAD') {
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
      try {
        request.params = validated.params as any;
      } catch {
        // Request.params can be readonly on Bun-native requests.
      }
    }
    if ('query' in validated) {
      try {
        request.query = validated.query as any;
      } catch {
        // Request.query can be readonly/non-configurable on some request objects.
      }
    }
    if ('cookies' in validated) {
      try {
        request.cookies = validated.cookies as any;
      } catch {
        // Request.cookies can be readonly/non-configurable on some request objects.
      }
    }
    if ('body' in validated) {
      this.setContentAndBodyAlias(request, validated.body);
    }
  }

  private setContentAndBodyAlias(request: VectorRequest<TTypes>, value: unknown): void {
    try {
      request.content = value;
    } catch {
      // Request.content can be readonly/non-configurable on some request objects.
      return;
    }

    this.setBodyAlias(request, value);
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

    if (options.validate === false) {
      return null;
    }

    if (!isStandardRouteSchema(inputSchema)) {
      return APIError.internalServerError('Invalid route schema configuration', options.responseContentType);
    }

    const includeRawIssues = this.isDevelopmentMode();
    const payload = await this.buildInputValidationPayload(request, options);

    try {
      const validation = await runStandardValidation(inputSchema, payload);
      if (validation.success === false) {
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

  private getOrCreateMethodMap(path: string): BunMethodMap {
    const existing = this.routeTable[path];
    if (existing instanceof Response) {
      throw new Error(`Cannot register method route for path "${path}" because a static route already exists.`);
    }
    if (existing) {
      return existing as BunMethodMap;
    }

    const methodMap = Object.create(null) as BunMethodMap;
    this.routeTable[path] = methodMap;
    this.addRouteMatcher(path);
    return methodMap;
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

  private static parseQuery(url: URL): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of url.searchParams) {
      if (key in query) {
        const existing = query[key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          query[key] = [existing as string, value];
        }
      } else {
        query[key] = value;
      }
    }
    return query;
  }

  private routeSpecificityScore(path: string): number {
    const STATIC_SEGMENT_WEIGHT = 1000;
    const PARAM_SEGMENT_WEIGHT = 10;
    const WILDCARD_WEIGHT = 1;
    const EXACT_MATCH_BONUS = 10000;

    const segments = path.split('/').filter(Boolean);
    let score = 0;

    for (const segment of segments) {
      if (segment.includes('*')) {
        score += WILDCARD_WEIGHT;
      } else if (segment.startsWith(':')) {
        score += PARAM_SEGMENT_WEIGHT;
      } else {
        score += STATIC_SEGMENT_WEIGHT;
      }
    }

    score += path.length;
    if (!path.includes(':') && !path.includes('*')) {
      score += EXACT_MATCH_BONUS;
    }

    return score;
  }
}
