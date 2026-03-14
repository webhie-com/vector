# Configuration

Vector apps are configured with `vector.config.ts` using `VectorConfigSchema`.

## Config Schema

```ts
interface VectorConfigSchema {
  // Server
  port?: number | string;
  hostname?: string;
  reusePort?: boolean;
  development?: boolean;
  routesDir?: string;
  routeExcludePatterns?: string[];
  idleTimeout?: number;
  defaults?: {
    route?: {
      auth?:
        | boolean
        | "ApiKey"
        | "HttpBasic"
        | "HttpBearer"
        | "HttpDigest"
        | "OAuth2"
        | "OpenIdConnect"
        | "MutualTls";
      expose?: boolean;
      rawRequest?: boolean;
      validate?: boolean;
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
        target?: "openapi-3.0" | "draft-2020-12" | "draft-07" | string;
        docs?:
          | boolean
          | {
              enabled?: boolean;
              path?: string;
              exposePaths?: string[];
            };
        info?: {
          title?: string;
          version?: string;
          description?: string;
        };
        auth?: {
          securitySchemeNames?: Partial<
            Record<
              | "ApiKey"
              | "HttpBasic"
              | "HttpBearer"
              | "HttpDigest"
              | "OAuth2"
              | "OpenIdConnect"
              | "MutualTls",
              string
            >
          >;
          securitySchemes?: Partial<
            Record<
              | "ApiKey"
              | "HttpBasic"
              | "HttpBearer"
              | "HttpDigest"
              | "OAuth2"
              | "OpenIdConnect"
              | "MutualTls",
              {
                type: string;
                [key: string]: unknown;
              }
            >
          >;
        };
      };

  // Startup lifecycle
  startup?: () => Promise<void> | void;
  shutdown?: () => Promise<void> | void;

  // Checkpoints
  checkpoint?: {
    enabled?: boolean; // default: true when checkpoint config is present
    storageDir?: string;
    maxCheckpoints?: number;
    versionHeader?: string; // default: x-vector-checkpoint-version
    idleTimeoutMs?: number; // default: 600000 (10 minutes)
    cacheKeyOverride?: boolean; // default: false
  };

  // Handlers
  auth?: (context: VectorContext) => Promise<unknown> | unknown;
  cache?: (
    key: string,
    factory: () => Promise<unknown>,
    ttl: number,
  ) => Promise<unknown>;

  // Middleware
  before?: Array<
    (context: VectorContext) => Promise<void | Response> | void | Response
  >;
  after?: Array<
    (response: Response, context: VectorContext) => Promise<Response> | Response
  >;
}
```

## Runtime Note

`dev` and `start` both load your config file (`vector.config.ts` by default, or `--config <path>`).
`startVector()` also loads the same config file by default (or `configPath` override).

- `start` uses production mode (`NODE_ENV=production`).
- Function-based handlers and middleware (`auth`, `cache`, `before`, `after`, function `cors.origin`) are available in both modes.
- `startup` runs before route discovery (if enabled) and before the server begins listening.
- Lifecycle order is: load config -> set auth/cache handlers -> run `startup` -> discover routes (if enabled) -> listen.
- In `dev` with file watching, `startup` runs again on each restart triggered by code changes.
- `shutdown` runs when the process receives `SIGINT` or `SIGTERM`, after the server stops accepting new requests and before exit.

## Route Defaults

`defaults.route` applies only when a route does not explicitly set the same option.

Example precedence:

- `defaults.route.auth = true`
- route has `auth: false`
- effective value is `false` (route override wins)

## Request/Context Notes

- Route handlers, `before`, `after`, and `auth` all receive `context` (not a mutable request object).
- Use `context.request` for the native `Request`.
- Use `context.params`, `context.query`, and `context.cookies` for baseline route/query/cookie access.
- Use `context.content`, `context.validatedInput`, `context.authUser`, and `context.metadata` for framework values (`metadata` always exists and defaults to `{}`).
- Do not mutate `context.request`; store custom per-request values in `context.metadata` (for example, `context.metadata.startTime`).
- For checkpoint compatibility, avoid adding custom top-level fields on `context`; checkpoint forwarding preserves `metadata`, `content`, `validatedInput`, and `authUser`.

## Hook Execution Semantics

- Per-request order is: `before` -> `auth` (when enabled) -> handler/checkpoint -> `after`.
- `after` runs for responses produced during handler/checkpoint execution, including validation failures and thrown errors/responses.
- `after` does not run for early short-circuit responses: `before` returning `Response`, auth failures (`401`), or `expose: false` route rejections (`403`).
- With CORS enabled, CORS headers are still applied to these short-circuit responses.
- Observability tip: if you need logs for denied/short-circuit requests, instrument `before` and/or `auth` (not only `after`).

## Example Configuration

```ts
import type { VectorConfigSchema } from "vector-framework";

const config: VectorConfigSchema = {
  // number | string: TCP port for Bun.serve (string is coerced with Number() at runtime)
  port: process.env.PORT ?? 3000,
  // string: host/interface to bind
  hostname: "0.0.0.0",
  // boolean: toggles development-mode defaults
  development: process.env.NODE_ENV !== "production",
  // string: directory scanned for route files
  routesDir: "./routes",
  // string[]: glob patterns skipped by route discovery
  routeExcludePatterns: ["*.test.ts", "*.spec.ts", "**/__tests__/**"],
  // number (seconds): keep-alive timeout for idle connections
  idleTimeout: 60,
  // boolean: enables SO_REUSEPORT when supported
  reusePort: true,

  defaults: {
    route: {
      // boolean: route is externally reachable unless overridden
      expose: true,
      // boolean | AuthKind: auth required by default unless overridden
      auth: false,
      // boolean: validate schema.input by default
      validate: true,
      // boolean: skip body parsing when true
      rawRequest: false,
      // boolean: return handler output as-is when true
      rawResponse: false,
    },
  },

  cors: {
    // string | string[] | (origin) => boolean
    origin: ["https://app.example.com"],
    // boolean: include Access-Control-Allow-Credentials
    credentials: true,
    // string | string[]
    allowHeaders: ["Content-Type", "Authorization"],
    // string | string[]
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // string | string[]
    exposeHeaders: ["x-request-id"],
    // number (seconds)
    maxAge: 86400,
  },

  openapi: {
    // boolean: turn OpenAPI generation on/off
    enabled: process.env.NODE_ENV !== "production",
    // string: OpenAPI JSON endpoint
    path: "/openapi.json",
    // string: output dialect
    target: "openapi-3.0",
    docs: {
      // boolean: built-in docs UI
      enabled: true,
      // string: docs UI endpoint
      path: "/docs",
      // string[]: optional path filters for docs UI only
      exposePaths: ["/health", "/users*"],
    },
    info: {
      // string: OpenAPI info.title
      title: "My API",
      // string: OpenAPI info.version
      version: "1.0.0",
      // string: OpenAPI info.description
      description: "Internal API",
    },
    auth: {
      // Optional: OpenAPI auth customization only (does not enforce runtime auth).
      // Optional: rename the key used in components.securitySchemes.
      // This is only a label/reference name (like a variable name), not the auth behavior itself.
      // Most projects can keep defaults and omit this.
      securitySchemeNames: {
        HttpBearer: "BearerAuth",
      },
      // Optional: define what the OpenAPI scheme actually is for each AuthKind.
      // Use this when defaults are not enough (common for OAuth2/OpenID URLs or custom bearer format).
      securitySchemes: {
        HttpBearer: {
          // OpenAPI security scheme type
          type: "http",
          // HTTP auth scheme
          scheme: "bearer",
          // Optional hint shown in docs/clients
          bearerFormat: "JWT",
          // Optional docs text for users
          description: "Paste an access token in the Authorization header.",
        },
      },
    },
  },

  checkpoint: {
    // boolean: enable checkpoint gateway
    enabled: true,
    // string: root directory for checkpoint artifacts
    storageDir: "./.vector/checkpoints",
    // number: prune older versions above this count
    maxCheckpoints: 10,
    // string: request header used to select checkpoint version
    versionHeader: "x-vector-checkpoint-version",
    // number (ms): stop idle checkpoint child processes after timeout
    idleTimeoutMs: 600000,
    // boolean: replace explicit route cache keys for version-tagged requests
    cacheKeyOverride: true,
  },

  // () => Promise<void> | void
  // Runs once before route discovery and before the server starts listening.
  startup: async () => {
    await loadOramaDatastore();
  },
  // () => Promise<void> | void
  // Runs during graceful shutdown (SIGINT/SIGTERM) before process exit.
  shutdown: async () => {
    await closeOramaDatastore();
  },

  // (context) => Promise<AuthUser> | AuthUser
  // Runtime auth resolver for protected routes; return user-like data for context.authUser.
  auth: async (context) => {
    const authHeader = context.request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      throw new Error("Unauthorized");
    }

    // Example only: replace this with real token/session verification.
    // For example, verify a JWT and load the user from your database or auth provider.
    if (token !== "dev-token") {
      throw new Error("Unauthorized");
    }
    return { id: "user-1", email: "user@example.com" };
  },

  // (key, factory, ttlSeconds) => Promise<unknown>
  // Global cache adapter used by route-level caching; call factory() on cache miss.
  cache: async (key, factory, ttl) => {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const value = await factory();
    await redis.setex(key, ttl, JSON.stringify(value));
    return value;
  },

  // Array of middleware run before route handlers.
  before: [
    // (context) => void | Response
    // Return a Response to short-circuit the request.
    async (context) => {
      context.metadata.startTime = Date.now();
    },
  ],
  // Array of middleware run after handlers; receives handler response.
  after: [
    // (response, context) => Response
    // Must return the Response to be sent to the client.
    async (response, context) => {
      const start =
        typeof context.metadata.startTime === "number"
          ? context.metadata.startTime
          : Date.now();
      response.headers.set("x-response-time", `${Date.now() - start}ms`);
      return response;
    },
  ],
};

export default config;
```
