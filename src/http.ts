import { CONTENT_TYPES, HTTP_STATUS } from './constants';
import type {
  CacheOptions,
  DefaultVectorTypes,
  GetAuthType,
  InferRouteInputFromSchemaDefinition,
  RouteAuthOption,
  RouteSchemaDefinition,
  VectorContext,
  VectorRequest,
  VectorTypes,
} from './types';
import { getVectorInstance } from './core/vector';

interface ExtendedApiOptions<TSchemaDef extends RouteSchemaDefinition | undefined = RouteSchemaDefinition | undefined>
  extends ApiOptions<TSchemaDef> {
  method: string;
  path: string;
}

export interface RouteDefinition<
  TTypes extends VectorTypes = DefaultVectorTypes,
  TValidatedInput = undefined,
  TSchemaDef extends RouteSchemaDefinition | undefined = RouteSchemaDefinition | undefined,
> {
  entry: { method: string; path: string };
  options: ExtendedApiOptions<TSchemaDef>;
  handler: (ctx: VectorContext<TTypes, TValidatedInput>) => Promise<unknown> | unknown;
}

export function route<
  TTypes extends VectorTypes = DefaultVectorTypes,
  TSchemaDef extends RouteSchemaDefinition | undefined = RouteSchemaDefinition | undefined,
>(
  options: ExtendedApiOptions<TSchemaDef>,
  fn: (ctx: VectorContext<TTypes, InferRouteInputFromSchemaDefinition<TSchemaDef>>) => Promise<unknown> | unknown
): RouteDefinition<TTypes, InferRouteInputFromSchemaDefinition<TSchemaDef>, TSchemaDef> {
  return {
    entry: {
      method: options.method.toUpperCase(),
      path: options.path,
    },
    options,
    handler: fn,
  };
}

export function depRoute<
  TTypes extends VectorTypes = DefaultVectorTypes,
  TSchemaDef extends RouteSchemaDefinition | undefined = RouteSchemaDefinition | undefined,
>(
  options: ExtendedApiOptions<TSchemaDef>,
  fn: (ctx: VectorContext<TTypes, InferRouteInputFromSchemaDefinition<TSchemaDef>>) => Promise<unknown> | unknown
): RouteDefinition<TTypes, InferRouteInputFromSchemaDefinition<TSchemaDef>, TSchemaDef> {
  return route<TTypes, TSchemaDef>(
    {
      ...options,
      deprecated: true,
    },
    fn
  );
}

function stringifyData(data: unknown): string {
  const val = data ?? null;
  try {
    return JSON.stringify(val);
  } catch (e) {
    if (e instanceof TypeError && /\bbigint\b/i.test(e.message)) {
      return JSON.stringify(val, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
    }
    throw e;
  }
}

export type ResponseCookieSameSite = 'Strict' | 'Lax' | 'None';
export type ResponseCookiePriority = 'Low' | 'Medium' | 'High';

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date | string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: ResponseCookieSameSite;
  partitioned?: boolean;
  priority?: ResponseCookiePriority;
}

export type ResponseCookieInput = ResponseCookie | string;
export type ResponseHeadersInit = Headers | Array<[string, string]> | Record<string, string>;

export interface CreateResponseOptions {
  contentType?: string;
  headers?: ResponseHeadersInit;
  cookies?: ResponseCookieInput[];
  statusText?: string;
}

function isJsonContentType(contentType: string): boolean {
  const mimeType = contentType.split(';', 1)[0] ?? contentType;
  return mimeType.trim().toLowerCase() === CONTENT_TYPES.JSON;
}

function serializeCookie(cookie: ResponseCookie): string {
  const segments = [`${cookie.name}=${cookie.value}`];

  if (cookie.maxAge !== undefined && Number.isFinite(cookie.maxAge)) {
    segments.push(`Max-Age=${Math.trunc(cookie.maxAge)}`);
  }

  if (cookie.domain) {
    segments.push(`Domain=${cookie.domain}`);
  }

  if (cookie.path) {
    segments.push(`Path=${cookie.path}`);
  }

  if (cookie.expires !== undefined) {
    const expiresAt = cookie.expires instanceof Date ? cookie.expires : new Date(cookie.expires);
    if (!Number.isNaN(expiresAt.getTime())) {
      segments.push(`Expires=${expiresAt.toUTCString()}`);
    }
  }

  if (cookie.httpOnly) {
    segments.push('HttpOnly');
  }

  if (cookie.secure) {
    segments.push('Secure');
  }

  if (cookie.sameSite) {
    segments.push(`SameSite=${cookie.sameSite}`);
  }

  if (cookie.partitioned) {
    segments.push('Partitioned');
  }

  if (cookie.priority) {
    segments.push(`Priority=${cookie.priority}`);
  }

  return segments.join('; ');
}

function appendSetCookieHeaders(headers: Headers, cookies?: ResponseCookieInput[]): void {
  if (!cookies || cookies.length === 0) {
    return;
  }

  for (const cookie of cookies) {
    headers.append('set-cookie', typeof cookie === 'string' ? cookie : serializeCookie(cookie));
  }
}

const ApiResponse = {
  success: <T>(data: T, contentType?: string) => createResponse(HTTP_STATUS.OK, data, contentType),
  created: <T>(data: T, contentType?: string) => createResponse(HTTP_STATUS.CREATED, data, contentType),
};

function createErrorResponse(code: number, message: string, contentType?: string): Response {
  const errorBody = {
    error: true,
    message,
    statusCode: code,
    timestamp: new Date().toISOString(),
  };

  return createResponse(code, errorBody, contentType);
}

export const APIError = {
  // 4xx Client Errors
  badRequest: (msg = 'Bad Request', contentType?: string) =>
    createErrorResponse(HTTP_STATUS.BAD_REQUEST, msg, contentType),

  unauthorized: (msg = 'Unauthorized', contentType?: string) =>
    createErrorResponse(HTTP_STATUS.UNAUTHORIZED, msg, contentType),

  paymentRequired: (msg = 'Payment Required', contentType?: string) => createErrorResponse(402, msg, contentType),

  forbidden: (msg = 'Forbidden', contentType?: string) => createErrorResponse(HTTP_STATUS.FORBIDDEN, msg, contentType),

  notFound: (msg = 'Not Found', contentType?: string) => createErrorResponse(HTTP_STATUS.NOT_FOUND, msg, contentType),

  methodNotAllowed: (msg = 'Method Not Allowed', contentType?: string) => createErrorResponse(405, msg, contentType),

  notAcceptable: (msg = 'Not Acceptable', contentType?: string) => createErrorResponse(406, msg, contentType),

  requestTimeout: (msg = 'Request Timeout', contentType?: string) => createErrorResponse(408, msg, contentType),

  conflict: (msg = 'Conflict', contentType?: string) => createErrorResponse(HTTP_STATUS.CONFLICT, msg, contentType),

  gone: (msg = 'Gone', contentType?: string) => createErrorResponse(410, msg, contentType),

  lengthRequired: (msg = 'Length Required', contentType?: string) => createErrorResponse(411, msg, contentType),

  preconditionFailed: (msg = 'Precondition Failed', contentType?: string) => createErrorResponse(412, msg, contentType),

  payloadTooLarge: (msg = 'Payload Too Large', contentType?: string) => createErrorResponse(413, msg, contentType),

  uriTooLong: (msg = 'URI Too Long', contentType?: string) => createErrorResponse(414, msg, contentType),

  unsupportedMediaType: (msg = 'Unsupported Media Type', contentType?: string) =>
    createErrorResponse(415, msg, contentType),

  rangeNotSatisfiable: (msg = 'Range Not Satisfiable', contentType?: string) =>
    createErrorResponse(416, msg, contentType),

  expectationFailed: (msg = 'Expectation Failed', contentType?: string) => createErrorResponse(417, msg, contentType),

  imATeapot: (msg = "I'm a teapot", contentType?: string) => createErrorResponse(418, msg, contentType),

  misdirectedRequest: (msg = 'Misdirected Request', contentType?: string) => createErrorResponse(421, msg, contentType),

  unprocessableEntity: (msg = 'Unprocessable Entity', contentType?: string) =>
    createErrorResponse(HTTP_STATUS.UNPROCESSABLE_ENTITY, msg, contentType),

  locked: (msg = 'Locked', contentType?: string) => createErrorResponse(423, msg, contentType),

  failedDependency: (msg = 'Failed Dependency', contentType?: string) => createErrorResponse(424, msg, contentType),

  tooEarly: (msg = 'Too Early', contentType?: string) => createErrorResponse(425, msg, contentType),

  upgradeRequired: (msg = 'Upgrade Required', contentType?: string) => createErrorResponse(426, msg, contentType),

  preconditionRequired: (msg = 'Precondition Required', contentType?: string) =>
    createErrorResponse(428, msg, contentType),

  tooManyRequests: (msg = 'Too Many Requests', contentType?: string) => createErrorResponse(429, msg, contentType),

  requestHeaderFieldsTooLarge: (msg = 'Request Header Fields Too Large', contentType?: string) =>
    createErrorResponse(431, msg, contentType),

  unavailableForLegalReasons: (msg = 'Unavailable For Legal Reasons', contentType?: string) =>
    createErrorResponse(451, msg, contentType),

  // 5xx Server Errors
  internalServerError: (msg = 'Internal Server Error', contentType?: string) =>
    createErrorResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, msg, contentType),

  notImplemented: (msg = 'Not Implemented', contentType?: string) => createErrorResponse(501, msg, contentType),

  badGateway: (msg = 'Bad Gateway', contentType?: string) => createErrorResponse(502, msg, contentType),

  serviceUnavailable: (msg = 'Service Unavailable', contentType?: string) => createErrorResponse(503, msg, contentType),

  gatewayTimeout: (msg = 'Gateway Timeout', contentType?: string) => createErrorResponse(504, msg, contentType),

  httpVersionNotSupported: (msg = 'HTTP Version Not Supported', contentType?: string) =>
    createErrorResponse(505, msg, contentType),

  variantAlsoNegotiates: (msg = 'Variant Also Negotiates', contentType?: string) =>
    createErrorResponse(506, msg, contentType),

  insufficientStorage: (msg = 'Insufficient Storage', contentType?: string) =>
    createErrorResponse(507, msg, contentType),

  loopDetected: (msg = 'Loop Detected', contentType?: string) => createErrorResponse(508, msg, contentType),

  notExtended: (msg = 'Not Extended', contentType?: string) => createErrorResponse(510, msg, contentType),

  networkAuthenticationRequired: (msg = 'Network Authentication Required', contentType?: string) =>
    createErrorResponse(511, msg, contentType),

  // Aliases for common use cases
  invalidArgument: (msg = 'Invalid Argument', contentType?: string) =>
    createErrorResponse(HTTP_STATUS.UNPROCESSABLE_ENTITY, msg, contentType),

  rateLimitExceeded: (msg = 'Rate Limit Exceeded', contentType?: string) => createErrorResponse(429, msg, contentType),

  maintenance: (msg = 'Service Under Maintenance', contentType?: string) => createErrorResponse(503, msg, contentType),

  // Helper to create custom error with any status code
  custom: (statusCode: number, msg: string, contentType?: string) => createErrorResponse(statusCode, msg, contentType),
};

export function createResponse(
  statusCode: number,
  data?: unknown,
  optionsOrContentType: string | CreateResponseOptions = CONTENT_TYPES.JSON
): Response {
  const options =
    typeof optionsOrContentType === 'string'
      ? ({ contentType: optionsOrContentType } as CreateResponseOptions)
      : (optionsOrContentType ?? {});

  const headers = new Headers(options.headers);
  const contentType = options.contentType ?? headers.get('content-type') ?? CONTENT_TYPES.JSON;

  if (options.contentType || !headers.has('content-type')) {
    headers.set('content-type', contentType);
  }

  appendSetCookieHeaders(headers, options.cookies);

  const body = isJsonContentType(contentType) ? stringifyData(data) : data;

  return new Response(body as any, {
    status: statusCode,
    statusText: options.statusText,
    headers,
  });
}

export const protectedRoute = async <TTypes extends VectorTypes = DefaultVectorTypes>(
  context: VectorContext<TTypes>,
  responseContentType?: string
) => {
  const vector = getVectorInstance();

  const protectedHandler = vector.getProtectedHandler();
  if (!protectedHandler) {
    throw APIError.unauthorized('Authentication not configured', responseContentType);
  }

  try {
    const authUser = await protectedHandler(context as any);
    context.authUser = authUser as GetAuthType<TTypes>;
  } catch (error) {
    throw APIError.unauthorized(error instanceof Error ? error.message : 'Authentication failed', responseContentType);
  }
};

export interface ApiOptions<TSchemaDef extends RouteSchemaDefinition | undefined = RouteSchemaDefinition | undefined> {
  auth?: RouteAuthOption;
  expose?: boolean;
  deprecated?: boolean;
  rawRequest?: boolean;
  validate?: boolean;
  rawResponse?: boolean;
  cache?: CacheOptions | number | null;
  responseContentType?: string;
  schema?: TSchemaDef;
}

export function api<TTypes extends VectorTypes = DefaultVectorTypes, TValidatedInput = undefined>(
  options: ApiOptions,
  fn: (context: VectorContext<TTypes, TValidatedInput>) => Promise<unknown> | unknown
) {
  const {
    auth = false,
    expose = false,
    rawRequest = false,
    rawResponse = false,
    responseContentType = CONTENT_TYPES.JSON,
  } = options;

  return async (request: Request) => {
    const req = request as unknown as VectorRequest<TTypes, TValidatedInput>;
    let query: Record<string, string | string[]> = {};
    try {
      query = parseQuery(new URL(request.url));
    } catch {
      query = {};
    }
    const ctx = {
      request: req,
      metadata: {} as any,
      params: {} as any,
      query: query as any,
      cookies: parseCookies(request.headers.get('cookie')) as any,
    } as VectorContext<TTypes, TValidatedInput>;

    if (!expose) {
      return APIError.forbidden('Forbidden');
    }

    try {
      if (auth) {
        await protectedRoute(ctx as unknown as VectorContext<TTypes>, responseContentType);
      }

      if (!rawRequest && req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          const contentType = req.headers.get('content-type');
          if (contentType?.startsWith('application/json')) {
            setContextField(ctx as unknown as Record<string, unknown>, 'content', await req.json());
          } else if (contentType?.startsWith('application/x-www-form-urlencoded')) {
            setContextField(
              ctx as unknown as Record<string, unknown>,
              'content',
              Object.fromEntries(await req.formData())
            );
          } else if (contentType?.startsWith('multipart/form-data')) {
            setContextField(ctx as unknown as Record<string, unknown>, 'content', await req.formData());
          } else {
            setContextField(ctx as unknown as Record<string, unknown>, 'content', await req.text());
          }
        } catch {
          setContextField(ctx as unknown as Record<string, unknown>, 'content', null);
        }
      }

      const result = await fn(ctx);

      return rawResponse ? result : ApiResponse.success(result, responseContentType);
    } catch (err: unknown) {
      if (err instanceof Response) {
        return err;
      }
      return APIError.internalServerError(String(err), responseContentType);
    }
  };
}

function setContextField(target: Record<string, unknown>, key: string, value: unknown): void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(target as object, key);
  if (ownDescriptor && ownDescriptor.writable === false && typeof ownDescriptor.set !== 'function') {
    return;
  }

  try {
    target[key] = value;
    return;
  } catch {
    // Fall back to defining an own property when inherited Request fields are readonly accessors.
  }

  try {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Ignore when target is non-extensible.
  }
}

export default ApiResponse;

function parseQuery(url: URL): Record<string, string | string[]> {
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

function parseCookies(cookieHeader: string | null): Record<string, string> {
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
