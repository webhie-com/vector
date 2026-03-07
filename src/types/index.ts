import type { StandardJSONSchemaV1, StandardSchemaV1, StandardTypedV1 } from './standard-schema';

// Default AuthUser type - users can override this with their own type
export interface DefaultAuthUser {
  id: string;
  email?: string;
  role?: string;
  permissions?: string[];
  [key: string]: any;
}

// Extensible type configuration interface
// Users can override any of these types without breaking changes
export interface VectorTypes {
  auth?: any; // Custom auth user type
  context?: any; // Custom request context (future)
  cache?: any; // Custom cache value type (future)
  metadata?: any; // Custom metadata type (future)
}

// Default types
export interface DefaultVectorTypes extends VectorTypes {
  auth: DefaultAuthUser;
  context: Record<string, any>;
  cache: any;
  metadata: Record<string, any>;
}

// Type helpers
export type GetAuthType<T extends VectorTypes> = T['auth'] extends undefined ? DefaultAuthUser : T['auth'];

export type GetContextType<T extends VectorTypes> = T['context'] extends undefined ? Record<string, any> : T['context'];

export type GetCacheType<T extends VectorTypes> = T['cache'] extends undefined ? any : T['cache'];

export type GetMetadataType<T extends VectorTypes> = T['metadata'] extends undefined
  ? Record<string, any>
  : T['metadata'];

// Legacy support - keep AuthUser for backward compatibility
export type AuthUser = DefaultAuthUser;

type DefaultQueryShape = { [key: string]: string | string[] | undefined };
type DefaultParamsShape = Record<string, string>;
type DefaultCookiesShape = Record<string, string>;

type BaseVectorRequest = Omit<Request, 'body' | 'json' | 'text' | 'formData' | 'arrayBuffer' | 'blob'>;

type InferValidatedSection<TValidatedInput, TKey extends string, TFallback> = [TValidatedInput] extends [undefined]
  ? TFallback
  : TValidatedInput extends Record<string, unknown>
    ? TKey extends keyof TValidatedInput
      ? TValidatedInput[TKey]
      : TFallback
    : TFallback;

type InferValidatedInputValue<TValidatedInput> = [TValidatedInput] extends [undefined] ? unknown : TValidatedInput;

export type BunRouteHandler = (req: Request) => Response | Promise<Response>;
export type BunMethodMap = Record<string, BunRouteHandler>;
export type BunRouteTable = Record<string, BunMethodMap | Response>;
export type LegacyRouteEntry = [string, RegExp, [BunRouteHandler, ...BunRouteHandler[]], string?];

export interface VectorRequest<TTypes extends VectorTypes = DefaultVectorTypes, TValidatedInput = undefined>
  extends BaseVectorRequest {
  authUser?: GetAuthType<TTypes>;
  context: GetContextType<TTypes>;
  metadata?: GetMetadataType<TTypes>;
  content?: InferValidatedSection<TValidatedInput, 'body', any>;
  body?: InferValidatedSection<TValidatedInput, 'body', any>;
  params?: InferValidatedSection<TValidatedInput, 'params', DefaultParamsShape>;
  query: InferValidatedSection<TValidatedInput, 'query', DefaultQueryShape>;
  headers: Headers;
  cookies?: InferValidatedSection<TValidatedInput, 'cookies', DefaultCookiesShape>;
  validatedInput?: InferValidatedInputValue<TValidatedInput>;
  startTime?: number;
  [key: string]: any;
}

export interface CacheOptions {
  key?: string;
  ttl?: number;
}

export type StandardRouteSchema = StandardSchemaV1<any, any>;
export type RouteSchemaStatusCode = number | `${number}` | 'default';
export type RouteSchemaOutputMap = Partial<Record<RouteSchemaStatusCode, StandardRouteSchema>>;

export interface RouteSchemaDefinition<
  TInput extends StandardRouteSchema | undefined = StandardRouteSchema | undefined,
  TOutput extends RouteSchemaOutputMap | StandardRouteSchema | undefined =
    | RouteSchemaOutputMap
    | StandardRouteSchema
    | undefined,
> {
  input?: TInput;
  output?: TOutput;
  tag?: string;
}

export type InferStandardSchemaInput<TSchema extends StandardRouteSchema> = StandardSchemaV1.InferInput<TSchema>;
export type InferStandardSchemaOutput<TSchema extends StandardRouteSchema> = StandardSchemaV1.InferOutput<TSchema>;
export type StandardJSONSchemaCapable = StandardJSONSchemaV1<any, any>;

export type InferRouteInputFromSchemaDefinition<TSchemaDef extends RouteSchemaDefinition | undefined> =
  TSchemaDef extends { input: infer TInputSchema }
    ? TInputSchema extends StandardRouteSchema
      ? InferStandardSchemaOutput<TInputSchema>
      : undefined
    : undefined;

export interface RouteOptions<TTypes extends VectorTypes = DefaultVectorTypes> {
  method: string;
  path: string;
  auth?: boolean;
  expose?: boolean; // defaults to true
  cache?: CacheOptions | number;
  rawRequest?: boolean;
  validate?: boolean; // defaults to validating schema.input unless false
  rawResponse?: boolean;
  responseContentType?: string;
  metadata?: GetMetadataType<TTypes>;
  schema?: RouteSchemaDefinition;
}

export interface RouteBooleanDefaults {
  auth?: boolean;
  expose?: boolean;
  rawRequest?: boolean;
  validate?: boolean;
  rawResponse?: boolean;
}

export interface VectorDefaults {
  route?: RouteBooleanDefaults;
}

// Legacy config interface - will be deprecated
export interface VectorConfig<TTypes extends VectorTypes = DefaultVectorTypes> {
  port?: number;
  hostname?: string;
  reusePort?: boolean;
  development?: boolean;
  cors?: CorsOptions;
  before?: BeforeMiddlewareHandler<TTypes>[];
  finally?: AfterMiddlewareHandler<TTypes>[];
  routesDir?: string;
  routeExcludePatterns?: string[];
  autoDiscover?: boolean;
  idleTimeout?: number;
  defaults?: VectorDefaults;
  openapi?: OpenAPIOptions | boolean;
}

// New config-driven schema - flat structure
export interface VectorConfigSchema<TTypes extends VectorTypes = DefaultVectorTypes> {
  // Server configuration
  port?: number;
  hostname?: string;
  reusePort?: boolean;
  development?: boolean;
  routesDir?: string;
  routeExcludePatterns?: string[];
  idleTimeout?: number;
  defaults?: VectorDefaults;

  // Middleware functions
  before?: BeforeMiddlewareHandler<TTypes>[];
  after?: AfterMiddlewareHandler<TTypes>[];

  // Handler functions
  auth?: ProtectedHandler<TTypes>;
  cache?: CacheHandler;

  // CORS configuration
  cors?: CorsOptions | boolean;

  // OpenAPI/docs configuration
  openapi?: OpenAPIOptions | boolean;

  // Custom types for TypeScript
  types?: VectorTypes;
}

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  credentials?: boolean;
  allowHeaders?: string | string[];
  allowMethods?: string | string[];
  exposeHeaders?: string | string[];
  maxAge?: number;
}

export interface OpenAPIDocsOptions {
  enabled?: boolean;
  path?: string;
}

export interface OpenAPIInfoOptions {
  title?: string;
  version?: string;
  description?: string;
}

export interface OpenAPIOptions {
  enabled?: boolean;
  path?: string;
  target?: 'openapi-3.0' | 'draft-2020-12' | 'draft-07' | ({} & string);
  docs?: boolean | OpenAPIDocsOptions;
  info?: OpenAPIInfoOptions;
}

export type BeforeMiddlewareHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  request: VectorRequest<TTypes>
) => Promise<VectorRequest<TTypes> | Response> | VectorRequest<TTypes> | Response;

export type AfterMiddlewareHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  response: Response,
  request: VectorRequest<TTypes>
) => Promise<Response> | Response;
export type MiddlewareHandler = BeforeMiddlewareHandler | AfterMiddlewareHandler;

export type RouteHandler<TTypes extends VectorTypes = DefaultVectorTypes, TValidatedInput = undefined> = (
  request: VectorRequest<TTypes, TValidatedInput>
) => Promise<any> | any;

export type ProtectedHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  request: VectorRequest<TTypes>
) => Promise<GetAuthType<TTypes>> | GetAuthType<TTypes>;

export type CacheHandler = (key: string, factory: () => Promise<any>, ttl: number) => Promise<any>;

export interface RouteDefinition<TTypes extends VectorTypes = DefaultVectorTypes, TValidatedInput = undefined> {
  options: RouteOptions<TTypes>;
  handler: RouteHandler<TTypes, TValidatedInput>;
}

export interface GeneratedRoute<TTypes extends VectorTypes = DefaultVectorTypes> {
  name: string;
  path: string;
  method: string;
  options: RouteOptions<TTypes>;
}

export type { StandardJSONSchemaV1, StandardSchemaV1, StandardTypedV1 };
