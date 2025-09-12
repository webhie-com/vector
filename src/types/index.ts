import type { IRequest } from 'itty-router';

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
export type GetAuthType<T extends VectorTypes> = T['auth'] extends undefined
  ? DefaultAuthUser
  : T['auth'];

export type GetContextType<T extends VectorTypes> = T['context'] extends undefined
  ? Record<string, any>
  : T['context'];

export type GetCacheType<T extends VectorTypes> = T['cache'] extends undefined ? any : T['cache'];

export type GetMetadataType<T extends VectorTypes> = T['metadata'] extends undefined
  ? Record<string, any>
  : T['metadata'];

// Legacy support - keep AuthUser for backward compatibility
export type AuthUser = DefaultAuthUser;

export interface VectorRequest<TTypes extends VectorTypes = DefaultVectorTypes>
  extends Omit<IRequest, 'params'> {
  authUser?: GetAuthType<TTypes>;
  context: GetContextType<TTypes>;
  metadata?: GetMetadataType<TTypes>;
  content?: any;
  params?: Record<string, string>;
  startTime?: number;
  [key: string]: any;
}

export interface CacheOptions {
  key?: string;
  ttl?: number;
}

export interface RouteOptions<TTypes extends VectorTypes = DefaultVectorTypes> {
  method: string;
  path: string;
  auth?: boolean;
  expose?: boolean; // defaults to true
  cache?: CacheOptions | number;
  rawRequest?: boolean;
  rawResponse?: boolean;
  responseContentType?: string;
  metadata?: GetMetadataType<TTypes>;
}

export interface VectorConfig<TTypes extends VectorTypes = DefaultVectorTypes> {
  port?: number;
  hostname?: string;
  reusePort?: boolean;
  development?: boolean;
  cors?: CorsOptions;
  before?: BeforeMiddlewareHandler<TTypes>[];
  finally?: AfterMiddlewareHandler<TTypes>[];
  routesDir?: string;
  autoDiscover?: boolean;
}

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  credentials?: boolean;
  allowHeaders?: string | string[];
  allowMethods?: string | string[];
  exposeHeaders?: string | string[];
  maxAge?: number;
}

export type BeforeMiddlewareHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  request: VectorRequest<TTypes>
) => Promise<VectorRequest<TTypes> | Response> | VectorRequest<TTypes> | Response;

export type AfterMiddlewareHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  response: Response,
  request: VectorRequest<TTypes>
) => Promise<Response> | Response;
export type MiddlewareHandler = BeforeMiddlewareHandler | AfterMiddlewareHandler;

export type RouteHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  request: VectorRequest<TTypes>
) => Promise<any> | any;

export type ProtectedHandler<TTypes extends VectorTypes = DefaultVectorTypes> = (
  request: VectorRequest<TTypes>
) => Promise<GetAuthType<TTypes>> | GetAuthType<TTypes>;

export type CacheHandler = (key: string, factory: () => Promise<any>, ttl: number) => Promise<any>;

export interface RouteDefinition<TTypes extends VectorTypes = DefaultVectorTypes> {
  options: RouteOptions<TTypes>;
  handler: RouteHandler<TTypes>;
}

export interface GeneratedRoute<TTypes extends VectorTypes = DefaultVectorTypes> {
  name: string;
  path: string;
  method: string;
  options: RouteOptions<TTypes>;
}
