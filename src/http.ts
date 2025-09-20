import { cors, type IRequest, type RouteEntry, withContent } from "itty-router";
import { CONTENT_TYPES, HTTP_STATUS } from "./constants";
import type {
  CacheOptions,
  DefaultVectorTypes,
  GetAuthType,
  VectorRequest,
  VectorTypes,
} from "./types";
import { getVectorInstance } from "./core/vector";

export interface ProtectedRequest<
  TTypes extends VectorTypes = DefaultVectorTypes
> extends IRequest {
  authUser?: GetAuthType<TTypes>;
}

export const { preflight, corsify } = cors({
  origin: "*",
  credentials: true,
  allowHeaders: "Content-Type, Authorization",
  allowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  exposeHeaders: "Authorization",
  maxAge: 86_400,
});

interface ExtendedApiOptions extends ApiOptions {
  method: string;
  path: string;
}

export interface RouteDefinition<
  TTypes extends VectorTypes = DefaultVectorTypes
> {
  entry: RouteEntry;
  options: ExtendedApiOptions;
  handler: (req: VectorRequest<TTypes>) => Promise<unknown>;
}

export function route<TTypes extends VectorTypes = DefaultVectorTypes>(
  options: ExtendedApiOptions,
  fn: (req: VectorRequest<TTypes>) => Promise<unknown>
): RouteDefinition<TTypes> {
  const handler = api(options, fn);

  const entry: RouteEntry = [
    options.method.toUpperCase(),
    RegExp(
      `^${
        options.path
          .replace(/\/+(\/|$)/g, "$1") // strip double & trailing splash
          .replace(/(\/?\.?):(\w+)\+/g, "($1(?<$2>*))") // greedy params
          .replace(/(\/?\.?):(\w+)/g, "($1(?<$2>[^$1/]+?))") // named params and image format
          .replace(/\./g, "\\.") // dot in path
          .replace(/(\/?)\*/g, "($1.*)?") // wildcard
      }/*$`
    ),
    [handler],
    options.path,
  ];

  return {
    entry,
    options,
    handler: fn,
  };
}

function stringifyData(data: unknown): string {
  return JSON.stringify(data ?? null, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

const ApiResponse = {
  success: <T>(data: T, contentType?: string) =>
    createResponse(HTTP_STATUS.OK, data, contentType),
  created: <T>(data: T, contentType?: string) =>
    createResponse(HTTP_STATUS.CREATED, data, contentType),
};

function createErrorResponse(
  code: number,
  message: string,
  contentType?: string
): Response {
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
  badRequest: (msg = "Bad Request", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.BAD_REQUEST, msg, contentType),

  unauthorized: (msg = "Unauthorized", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.UNAUTHORIZED, msg, contentType),

  paymentRequired: (msg = "Payment Required", contentType?: string) =>
    createErrorResponse(402, msg, contentType),

  forbidden: (msg = "Forbidden", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.FORBIDDEN, msg, contentType),

  notFound: (msg = "Not Found", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.NOT_FOUND, msg, contentType),

  methodNotAllowed: (msg = "Method Not Allowed", contentType?: string) =>
    createErrorResponse(405, msg, contentType),

  notAcceptable: (msg = "Not Acceptable", contentType?: string) =>
    createErrorResponse(406, msg, contentType),

  requestTimeout: (msg = "Request Timeout", contentType?: string) =>
    createErrorResponse(408, msg, contentType),

  conflict: (msg = "Conflict", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.CONFLICT, msg, contentType),

  gone: (msg = "Gone", contentType?: string) =>
    createErrorResponse(410, msg, contentType),

  lengthRequired: (msg = "Length Required", contentType?: string) =>
    createErrorResponse(411, msg, contentType),

  preconditionFailed: (msg = "Precondition Failed", contentType?: string) =>
    createErrorResponse(412, msg, contentType),

  payloadTooLarge: (msg = "Payload Too Large", contentType?: string) =>
    createErrorResponse(413, msg, contentType),

  uriTooLong: (msg = "URI Too Long", contentType?: string) =>
    createErrorResponse(414, msg, contentType),

  unsupportedMediaType: (
    msg = "Unsupported Media Type",
    contentType?: string
  ) => createErrorResponse(415, msg, contentType),

  rangeNotSatisfiable: (msg = "Range Not Satisfiable", contentType?: string) =>
    createErrorResponse(416, msg, contentType),

  expectationFailed: (msg = "Expectation Failed", contentType?: string) =>
    createErrorResponse(417, msg, contentType),

  imATeapot: (msg = "I'm a teapot", contentType?: string) =>
    createErrorResponse(418, msg, contentType),

  misdirectedRequest: (msg = "Misdirected Request", contentType?: string) =>
    createErrorResponse(421, msg, contentType),

  unprocessableEntity: (msg = "Unprocessable Entity", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.UNPROCESSABLE_ENTITY, msg, contentType),

  locked: (msg = "Locked", contentType?: string) =>
    createErrorResponse(423, msg, contentType),

  failedDependency: (msg = "Failed Dependency", contentType?: string) =>
    createErrorResponse(424, msg, contentType),

  tooEarly: (msg = "Too Early", contentType?: string) =>
    createErrorResponse(425, msg, contentType),

  upgradeRequired: (msg = "Upgrade Required", contentType?: string) =>
    createErrorResponse(426, msg, contentType),

  preconditionRequired: (msg = "Precondition Required", contentType?: string) =>
    createErrorResponse(428, msg, contentType),

  tooManyRequests: (msg = "Too Many Requests", contentType?: string) =>
    createErrorResponse(429, msg, contentType),

  requestHeaderFieldsTooLarge: (
    msg = "Request Header Fields Too Large",
    contentType?: string
  ) => createErrorResponse(431, msg, contentType),

  unavailableForLegalReasons: (
    msg = "Unavailable For Legal Reasons",
    contentType?: string
  ) => createErrorResponse(451, msg, contentType),

  // 5xx Server Errors
  internalServerError: (msg = "Internal Server Error", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, msg, contentType),

  notImplemented: (msg = "Not Implemented", contentType?: string) =>
    createErrorResponse(501, msg, contentType),

  badGateway: (msg = "Bad Gateway", contentType?: string) =>
    createErrorResponse(502, msg, contentType),

  serviceUnavailable: (msg = "Service Unavailable", contentType?: string) =>
    createErrorResponse(503, msg, contentType),

  gatewayTimeout: (msg = "Gateway Timeout", contentType?: string) =>
    createErrorResponse(504, msg, contentType),

  httpVersionNotSupported: (
    msg = "HTTP Version Not Supported",
    contentType?: string
  ) => createErrorResponse(505, msg, contentType),

  variantAlsoNegotiates: (
    msg = "Variant Also Negotiates",
    contentType?: string
  ) => createErrorResponse(506, msg, contentType),

  insufficientStorage: (msg = "Insufficient Storage", contentType?: string) =>
    createErrorResponse(507, msg, contentType),

  loopDetected: (msg = "Loop Detected", contentType?: string) =>
    createErrorResponse(508, msg, contentType),

  notExtended: (msg = "Not Extended", contentType?: string) =>
    createErrorResponse(510, msg, contentType),

  networkAuthenticationRequired: (
    msg = "Network Authentication Required",
    contentType?: string
  ) => createErrorResponse(511, msg, contentType),

  // Aliases for common use cases
  invalidArgument: (msg = "Invalid Argument", contentType?: string) =>
    createErrorResponse(HTTP_STATUS.UNPROCESSABLE_ENTITY, msg, contentType),

  rateLimitExceeded: (msg = "Rate Limit Exceeded", contentType?: string) =>
    createErrorResponse(429, msg, contentType),

  maintenance: (msg = "Service Under Maintenance", contentType?: string) =>
    createErrorResponse(503, msg, contentType),

  // Helper to create custom error with any status code
  custom: (statusCode: number, msg: string, contentType?: string) =>
    createErrorResponse(statusCode, msg, contentType),
};

export function createResponse(
  statusCode: number,
  data?: unknown,
  contentType: string = CONTENT_TYPES.JSON
): Response {
  const body = contentType === CONTENT_TYPES.JSON ? stringifyData(data) : data;

  return new Response(body as string, {
    status: statusCode,
    headers: { "content-type": contentType },
  });
}

export const protectedRoute = async <
  TTypes extends VectorTypes = DefaultVectorTypes
>(
  request: VectorRequest<TTypes>,
  responseContentType?: string
) => {
  // Get the Vector instance to access the protected handler
  const vector = getVectorInstance();

  const protectedHandler = vector.getProtectedHandler();
  if (!protectedHandler) {
    throw APIError.unauthorized(
      "Authentication not configured",
      responseContentType
    );
  }

  try {
    const authUser = await protectedHandler(request as any);
    request.authUser = authUser as GetAuthType<TTypes>;
  } catch (error) {
    throw APIError.unauthorized(
      error instanceof Error ? error.message : "Authentication failed",
      responseContentType
    );
  }
};

export interface ApiOptions {
  auth?: boolean;
  expose?: boolean;
  rawRequest?: boolean;
  rawResponse?: boolean;
  cache?: CacheOptions | number | null;
  responseContentType?: string;
}

export function api<TTypes extends VectorTypes = DefaultVectorTypes>(
  options: ApiOptions,
  fn: (request: VectorRequest<TTypes>) => Promise<unknown>
) {
  const {
    auth = false,
    expose = false,
    rawRequest = false,
    rawResponse = false,
    responseContentType = CONTENT_TYPES.JSON,
  } = options;

  // For backward compatibility with direct route usage (not auto-discovered)
  // This wrapper is only used when routes are NOT auto-discovered
  return async (request: IRequest) => {
    if (!expose) {
      return APIError.forbidden("Forbidden");
    }

    try {
      if (auth) {
        await protectedRoute(
          request as any as VectorRequest<TTypes>,
          responseContentType
        );
      }

      if (!rawRequest) {
        await withContent(request);
      }

      // Cache handling is now done in the router
      const result = await fn(request as any as VectorRequest<TTypes>);

      return rawResponse
        ? result
        : ApiResponse.success(result, responseContentType);
    } catch (err: unknown) {
      // Ensure we return a Response object
      if (err instanceof Response) {
        return err;
      }
      // For non-Response errors, wrap them
      return APIError.internalServerError(String(err), responseContentType);
    }
  };
}

export default ApiResponse;
