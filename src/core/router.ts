import type { AuthManager } from '../auth/protected';
import type { CacheManager } from '../cache/manager';
import { APIError, createResponse } from '../http';
import type { MiddlewareManager } from '../middleware/manager';
import { STATIC_RESPONSES } from '../constants';
import { AuthKind } from '../types';
import { buildRouteRegex } from '../utils/path';
import type { CheckpointGateway } from '../checkpoint/gateway';
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
  VectorContext,
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

const AUTH_KIND_VALUES = new Set<string>(Object.values(AuthKind));

function isAuthKindValue(value: unknown): value is AuthKind {
  return typeof value === 'string' && AUTH_KIND_VALUES.has(value);
}

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
  private checkpointGateway: CheckpointGateway | null = null;

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

  setCheckpointGateway(gateway: CheckpointGateway | null): void {
    this.checkpointGateway = gateway;
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

    // If a route explicitly sets auth:true and the global default auth is an AuthKind,
    // promote the route to that kind so OpenAPI docs and runtime defaults stay aligned.
    if (resolved.auth === true && isAuthKindValue(defaults.auth)) {
      resolved.auth = defaults.auth;
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
    const pathname = url.pathname;
    const directRoute = this.routeTable[pathname];

    if (directRoute) {
      if (directRoute instanceof Response) {
        return this.applyCorsResponse(directRoute.clone() as unknown as Response, request);
      }

      const methodMap = directRoute as BunMethodMap;
      const handler = methodMap[request.method] ?? (request.method === 'HEAD' ? methodMap['GET'] : undefined);

      if (handler) {
        const response = await handler(request);
        if (response) {
          return response;
        }
      }
    }

    for (const matcher of this.routeMatchers) {
      const path = matcher.path;
      const value = this.routeTable[path];
      if (!value) continue;
      if (value instanceof Response) {
        if (pathname === path) {
          return this.applyCorsResponse(value.clone() as unknown as Response, request);
        }
        continue;
      }
      const methodMap = value as BunMethodMap;
      const handler = methodMap[request.method] ?? (request.method === 'HEAD' ? methodMap['GET'] : undefined);
      if (!handler) {
        continue;
      }

      const match = pathname.match(matcher.regex);
      if (!match) {
        continue;
      }

      const response = await handler(request);
      if (response) return response;
    }

    return this.applyCorsResponse(STATIC_RESPONSES.NOT_FOUND.clone() as unknown as Response, request);
  }

  private cloneMetadata<T>(value: T): T {
    if (Array.isArray(value)) {
      return [...value] as unknown as T;
    }

    if (value && typeof value === 'object') {
      return { ...(value as Record<string, unknown>) } as unknown as T;
    }

    return value;
  }

  private createContext(
    request: VectorRequest<TTypes>,
    options?: {
      metadata?: any;
      params?: Record<string, string>;
      query?: Record<string, string | string[]>;
      cookies?: Record<string, string>;
    }
  ): VectorContext<TTypes> {
    const context = {
      request,
    } as VectorContext<TTypes>;

    this.setContextField(
      context,
      'metadata',
      options?.metadata !== undefined ? this.cloneMetadata(options.metadata) : ({} as any)
    );
    this.setContextField(context, 'params', options?.params ?? {});
    this.setContextField(context, 'query', options?.query ?? {});
    this.setContextField(context, 'cookies', options?.cookies ?? {});

    return context;
  }

  private setContextField(context: VectorContext<TTypes>, key: string, value: unknown): void {
    (context as Record<string, unknown>)[key] = value;
  }

  private hasOwnContextField(context: VectorContext<TTypes>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(context, key);
  }

  private buildCheckpointContextPayload(context: VectorContext<TTypes>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const allowedKeys = ['metadata', 'content', 'validatedInput', 'authUser'] as const;
    for (const key of allowedKeys) {
      if (!this.hasOwnContextField(context, key)) {
        continue;
      }

      const value = (context as Record<string, unknown>)[key];
      if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
        continue;
      }
      payload[key] = value;
    }
    return payload;
  }

  private resolveFallbackParams(pathname: string, routeMatcher: RegExp | null): Record<string, string> | undefined {
    if (!routeMatcher) {
      return undefined;
    }

    const matched = pathname.match(routeMatcher);
    if (!matched?.groups) {
      return undefined;
    }

    return matched.groups as Record<string, string>;
  }

  private getRequestedCheckpointVersion(request: Request): string | null {
    if (!this.checkpointGateway) {
      return null;
    }

    const gateway = this.checkpointGateway as unknown as {
      getRequestedVersion?: (request: Request) => string | null;
    } | null;
    if (gateway?.getRequestedVersion) {
      return gateway.getRequestedVersion(request);
    }

    const primary = request.headers.get('x-vector-checkpoint-version');
    if (primary && primary.trim().length > 0) {
      return primary.trim();
    }

    const fallback = request.headers.get('x-vector-checkpoint');
    if (fallback && fallback.trim().length > 0) {
      return fallback.trim();
    }

    return null;
  }

  private getCheckpointCacheKeyOverrideValue(request: Request): string | null {
    if (!this.checkpointGateway) {
      return null;
    }

    const gateway = this.checkpointGateway as unknown as {
      getCacheKeyOverrideValue?: (request: Request) => string | null;
    } | null;
    if (gateway?.getCacheKeyOverrideValue) {
      return gateway.getCacheKeyOverrideValue(request);
    }

    const primary = request.headers.get('x-vector-checkpoint-version');
    if (primary && primary.trim().length > 0) {
      return `x-vector-checkpoint-version:${primary.trim()}`;
    }

    const fallback = request.headers.get('x-vector-checkpoint');
    if (fallback && fallback.trim().length > 0) {
      return `x-vector-checkpoint:${fallback.trim()}`;
    }

    return null;
  }

  private applyCheckpointCacheNamespace(cacheKey: string, request: Request): string {
    const checkpointVersion = this.getRequestedCheckpointVersion(request);
    if (!checkpointVersion) {
      return cacheKey;
    }

    return `${cacheKey}:checkpoint=${checkpointVersion}`;
  }

  private applyCheckpointRouteKeyOverride(cacheKey: string, request: Request): string {
    const override = this.getCheckpointCacheKeyOverrideValue(request);
    if (!override) {
      return cacheKey;
    }

    return override;
  }

  private wrapHandler(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>) {
    const routePath = options.path;
    const routeMatcher = routePath.includes(':') ? buildRouteRegex(routePath) : null;

    return async (request: Request) => {
      const vectorRequest = request as unknown as VectorRequest<TTypes>;
      let pathname = '';
      try {
        pathname = new URL(request.url).pathname;
      } catch {
        // Ignore malformed URLs here; router.handle() already guards route matching.
      }
      const fallbackParams = this.resolveFallbackParams(pathname, routeMatcher);
      const context = this.createContext(vectorRequest, {
        metadata: options.metadata,
        params: this.getRequestParams(request, fallbackParams),
        query: this.getRequestQuery(request),
        cookies: this.getRequestCookies(request),
      });

      try {
        if (options.expose === false) {
          return APIError.forbidden('Forbidden');
        }

        const beforeResponse = await this.middlewareManager.executeBefore(context);
        if (beforeResponse instanceof Response) {
          return beforeResponse;
        }

        if (options.auth) {
          try {
            await this.authManager.authenticate(context);
          } catch (error) {
            return APIError.unauthorized(
              error instanceof Error ? error.message : 'Authentication failed',
              options.responseContentType
            );
          }
        }

        const executeRoute = async (): Promise<unknown> => {
          const req = context.request;

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
            this.setContextField(context, 'content', parsedContent);
          }

          const inputValidationResponse = await this.validateInputSchema(context, options, fallbackParams);
          if (inputValidationResponse) {
            return inputValidationResponse;
          }

          if (this.checkpointGateway) {
            const checkpointResponse = await this.checkpointGateway.handle(
              req as unknown as Request,
              this.buildCheckpointContextPayload(context)
            );
            if (checkpointResponse) {
              return checkpointResponse;
            }
          }

          return await handler(context as any);
        };

        let result: any;
        const cacheOptions = options.cache;

        if (cacheOptions && typeof cacheOptions === 'number' && cacheOptions > 0) {
          const cacheKey = this.applyCheckpointCacheNamespace(
            this.cacheManager.generateKey(context.request as any, {
              authUser: context.authUser,
            }),
            context.request as unknown as Request
          );
          result = await this.cacheManager.get(cacheKey, async () => await executeRoute(), cacheOptions);
        } else if (cacheOptions && typeof cacheOptions === 'object' && cacheOptions.ttl) {
          const hasRouteCacheKey = typeof cacheOptions.key === 'string' && cacheOptions.key.length > 0;
          let cacheKey: string;
          if (hasRouteCacheKey) {
            cacheKey = this.applyCheckpointRouteKeyOverride(
              cacheOptions.key as string,
              context.request as unknown as Request
            );
          } else {
            const generatedKey = this.cacheManager.generateKey(context.request as any, {
              authUser: context.authUser,
            });
            cacheKey = this.applyCheckpointCacheNamespace(generatedKey, context.request as unknown as Request);
          }
          result = await this.cacheManager.get(cacheKey, async () => await executeRoute(), cacheOptions.ttl);
        } else {
          result = await executeRoute();
        }

        if (result instanceof Response && !!cacheOptions) {
          result = result.clone();
        }

        let response: Response;
        if (options.rawResponse || result instanceof Response) {
          response = result instanceof Response ? result : new Response(result);
        } else {
          response = createResponse(200, result, options.responseContentType);
        }

        response = await this.middlewareManager.executeFinally(response, context);

        return this.applyCorsResponse(response, context.request as unknown as Request);
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
    context: VectorContext<TTypes>,
    options: RouteOptions<TTypes>,
    fallbackParams?: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const request = context.request;
    let body = this.hasOwnContextField(context, 'content') ? context.content : undefined;

    if (options.rawRequest && request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await (request as unknown as Request).clone().text();
      } catch {
        body = null;
      }
    }

    return {
      params: this.getRequestParams(request as unknown as Request, fallbackParams),
      query: this.getRequestQuery(request as unknown as Request),
      headers: Object.fromEntries(request.headers.entries()),
      cookies: this.getRequestCookies(request as unknown as Request),
      body,
    };
  }

  private getRequestParams(request: Request, fallbackParams?: Record<string, string>): Record<string, string> {
    const nativeParams = this.readRequestObjectField(request, 'params');
    if (nativeParams && Object.keys(nativeParams).length > 0) {
      return nativeParams as Record<string, string>;
    }
    return fallbackParams ?? {};
  }

  private getRequestQuery(request: Request): Record<string, string | string[]> {
    const nativeQuery = this.readRequestObjectField(request, 'query');
    if (nativeQuery) {
      return nativeQuery as Record<string, string | string[]>;
    }

    try {
      return VectorRouter.parseQuery(new URL(request.url));
    } catch {
      return {};
    }
  }

  private getRequestCookies(request: Request): Record<string, string> {
    const nativeCookies = this.readRequestObjectField(request, 'cookies');
    if (nativeCookies) {
      return nativeCookies as Record<string, string>;
    }

    return VectorRouter.parseCookies(request.headers.get('cookie'));
  }

  private readRequestObjectField(request: Request, key: string): Record<string, unknown> | undefined {
    const value = (request as any)[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private applyValidatedInput(context: VectorContext<TTypes>, validatedValue: unknown): void {
    this.setContextField(context, 'validatedInput', validatedValue as any);
  }

  private async validateInputSchema(
    context: VectorContext<TTypes>,
    options: RouteOptions<TTypes>,
    fallbackParams?: Record<string, string>
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
    const payload = await this.buildInputValidationPayload(context, options, fallbackParams);

    try {
      const validation = await runStandardValidation(inputSchema, payload);
      if (validation.success === false) {
        const issues = normalizeValidationIssues(validation.issues, includeRawIssues);
        return createResponse(422, createValidationErrorPayload('input', issues), options.responseContentType);
      }

      this.applyValidatedInput(context, validation.value);
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

  private static parseCookies(cookieHeader: string | null): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) {
      return cookies;
    }

    for (const pair of cookieHeader.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    }

    return cookies;
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

  private applyCorsResponse(response: Response, request: Request): Response {
    const entries = this.corsHeadersEntries;
    if (entries) {
      for (const [k, v] of entries) {
        response.headers.set(k, v);
      }
      return response;
    }

    const dynamicCors = this.corsHandler;
    if (dynamicCors) {
      return dynamicCors(response, request);
    }

    return response;
  }
}
