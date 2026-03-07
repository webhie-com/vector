# Configuration

Vector apps are configured with `vector.config.ts` using `VectorConfigSchema`.

## Config Schema

```ts
interface VectorConfigSchema {
  // Server
  port?: number;
  hostname?: string;
  reusePort?: boolean;
  development?: boolean;
  routesDir?: string;
  routeExcludePatterns?: string[];
  idleTimeout?: number;
  defaults?: {
    route?: {
      auth?: boolean;
      expose?: boolean;
      rawRequest?: boolean;
      validateRawRequest?: boolean;
      rawResponse?: boolean;
    };
  };

  // CORS
  cors?:
    | boolean
    | {
        origin?: string | string[] | ((origin: string) => boolean);
        credentials?: boolean;
        allowHeaders?: string | string[];
        allowMethods?: string | string[];
        exposeHeaders?: string | string[];
        maxAge?: number;
      };

  // OpenAPI
  openapi?:
    | boolean
    | {
        enabled?: boolean;
        path?: string;
        target?: 'openapi-3.0' | 'draft-2020-12' | 'draft-07' | string;
        docs?:
          | boolean
          | {
              enabled?: boolean;
              path?: string;
            };
        info?: {
          title?: string;
          version?: string;
          description?: string;
        };
      };

  // Handlers
  auth?: (request: Request) => Promise<unknown> | unknown;
  cache?: (key: string, factory: () => Promise<unknown>, ttl: number) => Promise<unknown>;

  // Middleware
  before?: Array<(request: Request) => Promise<Request | Response> | Request | Response>;
  after?: Array<(response: Response, request: Request) => Promise<Response> | Response>;
}
```

## Route Defaults

`defaults.route` applies only when a route does not explicitly set the same option.

Example precedence:

- `defaults.route.auth = true`
- route has `auth: false`
- effective value is `false` (route override wins)

## Example Configuration

```ts
import type { VectorConfigSchema } from 'vector-framework';

const config: VectorConfigSchema = {
  port: Number(process.env.PORT ?? 3000),
  hostname: '0.0.0.0',
  development: process.env.NODE_ENV !== 'production',
  routesDir: './routes',
  routeExcludePatterns: ['*.test.ts', '*.spec.ts', '**/__tests__/**'],
  idleTimeout: 60,

  defaults: {
    route: {
      expose: true,
      auth: false,
      rawResponse: false,
    },
  },

  cors: {
    origin: ['https://app.example.com'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },

  openapi: {
    enabled: process.env.NODE_ENV !== 'production',
    path: '/openapi.json',
    docs: false,
    info: {
      title: 'My API',
      version: '1.0.0',
    },
  },

  auth: async (request) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Unauthorized');
    return { id: 'user-1', email: 'user@example.com' };
  },

  cache: async (key, factory, ttl) => {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const value = await factory();
    await redis.setex(key, ttl, JSON.stringify(value));
    return value;
  },

  before: [
    async (request) => {
      (request as any).startTime = Date.now();
      return request;
    },
  ],
  after: [
    async (response, request) => {
      const start = (request as any).startTime ?? Date.now();
      response.headers.set('x-response-time', `${Date.now() - start}ms`);
      return response;
    },
  ],
};

export default config;
```
