import type { AuthManager } from '../auth/protected';
import type { CacheManager } from '../cache/manager';
import { APIError, createResponse } from '../http';
import type { MiddlewareManager } from '../middleware/manager';
import { STATIC_RESPONSES } from '../constants';
import { AuthKind } from '../types';
import { buildRouteRegex } from '../utils/path';
import type { CheckpointGateway } from '../checkpoint/gateway';
import { routeSpecificityScore, selectNativePaths } from './native-routes';
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

interface RequestInputs {
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
}

interface InputValidationResult {
  response: Response | null;
  requiresBody: boolean;
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
  // Handlers built by wrapHandler always resolve to a Response, so Bun may call them directly.
  // Legacy route entries can resolve to nothing to fall through, which only the JS router supports.
  private nativeEligibleHandlers = new WeakSet<object>();
  private routesChangedListener: (() => void) | null = null;

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
    this.nativeEligibleHandlers.add(wrappedHandler);
    const methodMap = this.getOrCreateMethodMap(path);
    methodMap[method] = wrappedHandler;

    this.routeDefinitions.push({
      method,
      path,
      options: resolvedOptions,
    });
    this.notifyRoutesChanged();
  }

  /**
   * Called whenever the route table changes, so a running server can refresh its native routes.
   * Returns an unsubscribe function that only removes this listener, so a stopped server cannot
   * detach the listener of a server started after it.
   */
  onRoutesChanged(listener: () => void): () => void {
    this.routesChangedListener = listener;
    return () => {
      if (this.routesChangedListener === listener) {
        this.routesChangedListener = null;
      }
    };
  }

  private notifyRoutesChanged(): void {
    this.routesChangedListener?.();
  }

  /**
   * The routes to hand to Bun.serve's native router. Requests it does not match natively fall
   * through to `fetch`, which must call {@link handle}; see ./native-routes.ts for why the
   * selected subset always resolves to the route the JS router would pick.
   */
  getNativeRoutes(options: { corsEnabled: boolean }): BunRouteTable {
    const nativeRoutes = Object.create(null) as BunRouteTable;
    const selectedPaths = selectNativePaths(Object.keys(this.routeTable));

    for (const path of selectedPaths) {
      const entry = this.routeTable[path];
      if (entry instanceof Response) {
        // The JS router adds CORS headers to static responses; Bun would serve them untouched.
        if (!options.corsEnabled) {
          nativeRoutes[path] = entry;
        }
        continue;
      }

      const methods = Object.create(null) as BunMethodMap;
      for (const [method, handler] of Object.entries(entry as BunMethodMap)) {
        if (!this.nativeEligibleHandlers.has(handler)) {
          continue;
        }
        // With CORS on, the server answers every OPTIONS request with a preflight first.
        if (method === 'OPTIONS' && options.corsEnabled) {
          continue;
        }
        methods[method] = handler;
      }

      if (Object.keys(methods).length > 0) {
        nativeRoutes[path] = methods;
      }
    }

    return nativeRoutes;
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
    this.notifyRoutesChanged();
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
    this.notifyRoutesChanged();
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
    this.notifyRoutesChanged();
  }

  // Legacy shim — no-op (Bun handles route priority natively)
  sortRoutes(): void {}

  // Compatibility handle() for unit tests — mirrors Bun's native routing without a server
  async handle(request: Request): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return this.applyCorsResponse(APIError.badRequest('Malformed request URL'), request);
    }
    const pathname = url.pathname;
    // Fast path: exact route lookup avoids scanning regex matchers for common static/method routes.
    const exactPathRoute = this.routeTable[pathname];

    if (exactPathRoute) {
      if (exactPathRoute instanceof Response) {
        // Route table stores a shared Response instance for static routes; clone per request.
        return this.applyCorsResponse(exactPathRoute.clone() as unknown as Response, request);
      }

      const exactPathMethodMap = exactPathRoute as BunMethodMap;
      const handler =
        exactPathMethodMap[request.method] ?? (request.method === 'HEAD' ? exactPathMethodMap['GET'] : undefined);

      if (handler) {
        const response = await handler(request);
        if (response) {
          return response;
        }
      }
    }

    for (const matcher of this.routeMatchers) {
      const path = matcher.path;
      const routeEntry = this.routeTable[path];
      if (!routeEntry) continue;
      if (routeEntry instanceof Response) {
        if (pathname === path) {
          // Same reason as exact-path static route handling above.
          return this.applyCorsResponse(routeEntry.clone() as unknown as Response, request);
        }
        continue;
      }
      const methodMap = routeEntry as BunMethodMap;
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

    // STATIC_RESPONSES are shared singletons; clone before per-request header mutation.
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

    // Decode like Bun's native router does, so a param has the same value however it was routed.
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(matched.groups)) {
      if (value === undefined) {
        continue;
      }
      try {
        params[key] = decodeURIComponent(value);
      } catch {
        params[key] = value;
      }
    }
    return params;
  }

  private hasNativeParams(request: Request): boolean {
    const params = this.readRequestObjectField(request, 'params');
    if (!params) {
      return false;
    }
    for (const _ in params) {
      return true;
    }
    return false;
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

  private async parseRequestBodyForContext(
    context: VectorContext<TTypes>,
    request: Request,
    checkpointRequested: boolean
  ): Promise<void> {
    let parsedContent: unknown = null;
    try {
      // For checkpoint requests we may forward the original stream later, so parse from a clone.
      const bodyReadRequest = checkpointRequested ? request.clone() : request;
      const contentType = bodyReadRequest.headers.get('content-type');
      if (contentType?.startsWith('application/json')) {
        parsedContent = await bodyReadRequest.json();
      } else if (contentType?.startsWith('application/x-www-form-urlencoded')) {
        parsedContent = Object.fromEntries(await bodyReadRequest.formData());
      } else if (contentType?.startsWith('multipart/form-data')) {
        parsedContent = await bodyReadRequest.formData();
      } else {
        parsedContent = await bodyReadRequest.text();
      }
    } catch {
      parsedContent = null;
    }

    this.setContextField(context, 'content', parsedContent);
  }

  private isLikelyStreamingBodyRequest(request: Request): boolean {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return false;
    }

    if (!request.body) {
      return false;
    }

    if ((request as { duplex?: unknown }).duplex === 'half') {
      return true;
    }

    const transferEncoding = request.headers.get('transfer-encoding');
    if (transferEncoding) {
      const hasChunked = transferEncoding.split(',').some((value) => value.trim().toLowerCase() === 'chunked');
      if (hasChunked) {
        return true;
      }
    }

    return false;
  }

  private wrapHandler(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>) {
    const routePath = options.path;
    const routeMatcher = routePath.includes(':') ? buildRouteRegex(routePath) : null;

    return async (request: Request) => {
      const vectorRequest = request as unknown as VectorRequest<TTypes>;
      // Bun's native router sets request.params; only requests routed in JS need the regex.
      let fallbackParams: Record<string, string> | undefined;
      if (routeMatcher && !this.hasNativeParams(request)) {
        let pathname = '';
        try {
          pathname = new URL(request.url).pathname;
        } catch {
          // Ignore malformed URLs here; router.handle() already guards route matching.
        }
        fallbackParams = this.resolveFallbackParams(pathname, routeMatcher);
      }
      // Parsed once per request and shared by the context and input validation.
      const requestInputs: RequestInputs = {
        params: this.getRequestParams(request, fallbackParams),
        query: this.getRequestQuery(request),
        cookies: this.getRequestCookies(request),
      };
      const context = this.createContext(vectorRequest, {
        metadata: options.metadata,
        params: requestInputs.params,
        query: requestInputs.query,
        cookies: requestInputs.cookies,
      });
      const finalizeResponse = async (response: Response): Promise<Response> => {
        const finalized = await this.middlewareManager.executeFinally(response, context);
        return this.applyCorsResponse(finalized, context.request as unknown as Request);
      };

      try {
        if (options.expose === false) {
          return this.applyCorsResponse(APIError.forbidden('Forbidden'), context.request as unknown as Request);
        }

        const beforeResponse = await this.middlewareManager.executeBefore(context);
        if (beforeResponse instanceof Response) {
          return this.applyCorsResponse(beforeResponse, context.request as unknown as Request);
        }

        if (options.auth) {
          try {
            await this.authManager.authenticate(context);
          } catch (error) {
            return this.applyCorsResponse(
              APIError.unauthorized(
                error instanceof Error ? error.message : 'Authentication failed',
                options.responseContentType
              ),
              context.request as unknown as Request
            );
          }
        }

        const executeRoute = async (): Promise<unknown> => {
          const req = context.request;
          const requestForRoute = req as unknown as Request;
          const checkpointRequested = this.getRequestedCheckpointVersion(requestForRoute) !== null;
          // Library-wide behavior: applies to any streaming request with input schema validation enabled,
          // regardless of whether checkpoint routing is in play.
          const shouldDeferStreamingValidation =
            this.isLikelyStreamingBodyRequest(requestForRoute) &&
            options.schema?.input !== undefined &&
            options.validate !== false;

          if (!options.rawRequest && req.method !== 'GET' && req.method !== 'HEAD' && !shouldDeferStreamingValidation) {
            await this.parseRequestBodyForContext(context, requestForRoute, checkpointRequested);
          }

          if (shouldDeferStreamingValidation) {
            const validationWithoutBody = await this.validateInputSchema(context, options, requestInputs, {
              includeBody: false,
              allowBodyDeferral: true,
            });
            if (validationWithoutBody.response) {
              return validationWithoutBody.response;
            }

            if (validationWithoutBody.requiresBody) {
              if (!options.rawRequest && req.method !== 'GET' && req.method !== 'HEAD') {
                await this.parseRequestBodyForContext(context, requestForRoute, checkpointRequested);
              }

              const fullValidation = await this.validateInputSchema(context, options, requestInputs);
              if (fullValidation.response) {
                return fullValidation.response;
              }
            }
          } else {
            const inputValidation = await this.validateInputSchema(context, options, requestInputs);
            if (inputValidation.response) {
              return inputValidation.response;
            }
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
          // Cache layers can return shared Response instances; clone before per-request mutations.
          result = result.clone();
        }

        let response: Response;
        if (options.rawResponse || result instanceof Response) {
          response = result instanceof Response ? result : new Response(result);
        } else {
          response = createResponse(200, result, options.responseContentType);
        }

        return await finalizeResponse(response);
      } catch (error) {
        if (error instanceof Response) {
          return await finalizeResponse(error);
        }

        console.error('Route handler error:', error);
        return await finalizeResponse(
          APIError.internalServerError(
            error instanceof Error ? error.message : String(error),
            options.responseContentType
          )
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
    requestInputs: RequestInputs,
    validationOptions?: { includeBody?: boolean }
  ): Promise<Record<string, unknown>> {
    const request = context.request;
    const includeBody = validationOptions?.includeBody !== false;
    let body = includeBody && this.hasOwnContextField(context, 'content') ? context.content : undefined;

    if (includeBody && options.rawRequest && request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        // Read raw body from a clone so handlers/checkpoint forwarding can still consume the original stream.
        body = await (request as unknown as Request).clone().text();
      } catch {
        body = null;
      }
    }

    return {
      params: requestInputs.params,
      query: requestInputs.query,
      headers: Object.fromEntries(request.headers.entries()),
      cookies: requestInputs.cookies,
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

    // request.url never carries a fragment, so everything after the first '?' is the query.
    const url = request.url;
    const queryStart = url.indexOf('?');
    if (queryStart === -1 || queryStart === url.length - 1) {
      return {};
    }
    return VectorRouter.parseQuery(new URLSearchParams(url.slice(queryStart + 1)));
  }

  private getRequestCookies(request: Request): Record<string, string> {
    const nativeCookies = this.readRequestObjectField(request, 'cookies');
    // Bun's native router sets request.cookies to a CookieMap (values behind .get()), which decodes
    // values and keeps the first duplicate. Parse the header instead so cookies look the same
    // however the request was routed.
    if (nativeCookies && typeof (nativeCookies as { get?: unknown }).get !== 'function') {
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

  private issueHasBodyPath(issue: unknown): boolean {
    if (!issue || typeof issue !== 'object' || !('path' in (issue as Record<string, unknown>))) {
      return false;
    }

    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path) || path.length === 0) {
      return false;
    }

    const segment = path[0];
    if (segment && typeof segment === 'object' && 'key' in (segment as Record<string, unknown>)) {
      return (segment as { key?: unknown }).key === 'body';
    }
    return segment === 'body';
  }

  private issueHasExplicitNonBodyPath(issue: unknown): boolean {
    if (!issue || typeof issue !== 'object' || !('path' in (issue as Record<string, unknown>))) {
      return false;
    }

    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path) || path.length === 0) {
      return false;
    }

    const segment = path[0];
    if (segment && typeof segment === 'object' && 'key' in (segment as Record<string, unknown>)) {
      return (segment as { key?: unknown }).key !== 'body';
    }
    return segment !== 'body';
  }

  private issueHasUnknownPath(issue: unknown): boolean {
    if (!issue || typeof issue !== 'object' || !('path' in (issue as Record<string, unknown>))) {
      return true;
    }

    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path)) {
      return true;
    }

    return path.length === 0;
  }

  private shouldDeferBodyValidation(
    issues: readonly unknown[],
    context: VectorContext<TTypes>,
    validationOptions?: { includeBody?: boolean; allowBodyDeferral?: boolean }
  ): boolean {
    if (!(validationOptions?.allowBodyDeferral === true && validationOptions?.includeBody === false)) {
      return false;
    }

    const request = context.request as unknown as Request;
    const mayHaveRequestBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
    if (!mayHaveRequestBody || issues.length === 0) {
      return false;
    }

    if (issues.some((issue) => this.issueHasBodyPath(issue))) {
      return true;
    }

    // Conservative fallback: if issues do not identify a non-body target and at least one issue
    // has unknown/empty path, retry once with body included.
    const hasExplicitNonBodyPath = issues.some((issue) => this.issueHasExplicitNonBodyPath(issue));
    const hasUnknownPath = issues.some((issue) => this.issueHasUnknownPath(issue));
    return !hasExplicitNonBodyPath && hasUnknownPath;
  }

  private async validateInputSchema(
    context: VectorContext<TTypes>,
    options: RouteOptions<TTypes>,
    requestInputs: RequestInputs,
    validationOptions?: { includeBody?: boolean; allowBodyDeferral?: boolean }
  ): Promise<InputValidationResult> {
    const inputSchema = options.schema?.input;

    if (!inputSchema) {
      return { response: null, requiresBody: false };
    }

    if (options.validate === false) {
      return { response: null, requiresBody: false };
    }

    if (!isStandardRouteSchema(inputSchema)) {
      return {
        response: APIError.internalServerError('Invalid route schema configuration', options.responseContentType),
        requiresBody: false,
      };
    }

    const includeRawIssues = this.isDevelopmentMode();
    const payload = await this.buildInputValidationPayload(context, options, requestInputs, {
      includeBody: validationOptions?.includeBody,
    });

    try {
      const validation = await runStandardValidation(inputSchema, payload);
      if (validation.success === false) {
        if (this.shouldDeferBodyValidation(validation.issues, context, validationOptions)) {
          return { response: null, requiresBody: true };
        }

        const issues = normalizeValidationIssues(validation.issues, includeRawIssues);
        return {
          response: createResponse(422, createValidationErrorPayload('input', issues), options.responseContentType),
          requiresBody: false,
        };
      }

      this.applyValidatedInput(context, validation.value);
      return { response: null, requiresBody: false };
    } catch (error) {
      const thrownIssues = extractThrownIssues(error);
      if (thrownIssues) {
        if (this.shouldDeferBodyValidation(thrownIssues, context, validationOptions)) {
          return { response: null, requiresBody: true };
        }

        const issues = normalizeValidationIssues(thrownIssues, includeRawIssues);
        return {
          response: createResponse(422, createValidationErrorPayload('input', issues), options.responseContentType),
          requiresBody: false,
        };
      }

      return {
        response: APIError.internalServerError(
          error instanceof Error ? error.message : 'Validation failed',
          options.responseContentType
        ),
        requiresBody: false,
      };
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
      specificity: routeSpecificityScore(path),
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

  private static parseQuery(searchParams: URLSearchParams): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of searchParams) {
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
