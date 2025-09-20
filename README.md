# Vector Framework

**Blazing fast, secure, and developer-friendly API framework for Bun**

- 🚀 **70,000+ requests/second** - Optimized for extreme performance
- 🔒 **Single dependency** - Only itty-router, minimizing security risks
- ⚡ **Zero build step** - Native TypeScript execution with Bun
- 💝 **Encore-like DX** - Declarative, type-safe APIs you'll love

## Quick Start

### Installation

```bash
bun add vector-framework
```

### 1. Configure Your App

Create `vector.config.ts` in your project root:

```typescript
// vector.config.ts
import type { VectorConfigSchema } from "vector-framework";

const config: VectorConfigSchema = {
  // Server configuration
  port: 3000,
  hostname: "localhost",
  development: process.env.NODE_ENV !== "production",
  routesDir: "./routes", // Auto-discovers routes here

  // CORS configuration
  cors: {
    origin: "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },

  // Authentication handler
  auth: async (request) => {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (token === "valid-token") {
      return { id: "user-123", email: "user@example.com" };
    }
    throw new Error("Invalid token");
  },

  // Optional: Cache handler (Redis example)
  cache: async (key, factory, ttl) => {
    // Your caching logic here
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const value = await factory();
    await redis.setex(key, ttl, JSON.stringify(value));
    return value;
  },

  // Optional: Middleware
  before: [
    async (request) => {
      console.log(`${request.method} ${request.url}`);
      return request;
    }
  ],
  after: [
    async (response, request) => {
      response.headers.set("X-Response-Time", `${Date.now() - request.startTime}ms`);
      return response;
    }
  ],
};

export default config;
```

### 2. Create Your First Route

```typescript
// routes/hello.ts
import { route } from "vector-framework";

// Simple public endpoint
export const hello = route(
  {
    method: "GET",
    path: "/hello/:name",
    expose: true, // Public endpoint (default: true)
  },
  async (req) => {
    return { message: `Hello ${req.params.name}!` };
  }
);

// Protected endpoint - uses auth from config
export const getProfile = route(
  {
    method: "GET",
    path: "/profile",
    auth: true, // Requires authentication
    expose: true,
  },
  async (req) => {
    return {
      user: req.authUser, // Typed from your auth handler
      timestamp: new Date(),
    };
  }
);

// Cached endpoint
export const getUsers = route(
  {
    method: "GET",
    path: "/users",
    cache: 300, // Cache for 5 minutes
    expose: true,
  },
  async () => {
    // Expensive operation, will be cached
    const users = await db.users.findMany();
    return { users };
  }
);
```

### 3. Start Your Server

```bash
# Development mode with hot reload
bun vector dev

# Production mode
bun vector start

# With custom options
bun vector dev --port 4000 --routes ./api
```

That's it! Your API is running at `http://localhost:3000` 🎉

## TypeScript Type Safety

Vector provides full type safety with customizable types. Define your types in the config and use them in routes:

```typescript
// vector.config.ts
import type { VectorConfigSchema, VectorTypes } from "vector-framework";

// Define your custom user type
interface MyUser {
  id: string;
  email: string;
  role: "admin" | "user";
  permissions: string[];
}

// Extend Vector types
interface MyAppTypes extends VectorTypes {
  auth: MyUser;
}

// Use in config with type parameter
const config: VectorConfigSchema<MyAppTypes> = {
  port: 3000,

  // Auth handler returns your custom type
  auth: async (request): Promise<MyUser> => {
    // Your auth logic
    return {
      id: "user-123",
      email: "user@example.com",
      role: "admin",
      permissions: ["read", "write"],
    };
  },
};

export default config;
export type { MyAppTypes }; // Export for use in routes
```

```typescript
// routes/admin.ts
import { route, APIError } from "vector-framework";
import type { MyAppTypes } from "../vector.config";

// Use type parameter to get fully typed request
export const adminOnly = route<MyAppTypes>(
  {
    method: "GET",
    path: "/admin/data",
    auth: true,
    expose: true,
  },
  async (req) => {
    // req.authUser is now typed as MyUser
    if (req.authUser?.role !== "admin") {
      throw APIError.forbidden("Admin access required");
    }

    // TypeScript knows these properties exist
    return {
      user: req.authUser.email,
      permissions: req.authUser.permissions,
    };
  }
);
```

## Core Features

### Route Options

```typescript
interface RouteOptions {
  method: string;           // HTTP method (GET, POST, etc.)
  path: string;            // Route path with params (/users/:id)
  expose?: boolean;        // Make route accessible (default: true)
  auth?: boolean;          // Require authentication
  cache?: number | {       // Cache configuration
    ttl: number;          // Time to live in seconds
    key?: string;         // Custom cache key
  };
  rawRequest?: boolean;    // Skip body parsing
  rawResponse?: boolean;   // Return raw response
  responseContentType?: string; // Response content type
}
```

### Request Object

Every route handler receives a typed request object:

```typescript
export const example = route(
  { method: "POST", path: "/example/:id" },
  async (req) => {
    // All available request properties:
    req.params.id;        // URL parameters
    req.query.search;      // Query parameters
    req.headers;           // Request headers
    req.cookies;           // Parsed cookies
    req.content;           // Parsed body (JSON/form data)
    req.authUser;          // Authenticated user (when auth: true)
    req.context;           // Request context
    req.metadata;          // Route metadata
  }
);
```

### Error Handling

Vector provides comprehensive error responses:

```typescript
import { APIError } from "vector-framework";

export const example = route(
  { method: "GET", path: "/data/:id" },
  async (req) => {
    // Client errors (4xx)
    if (!req.params.id) {
      throw APIError.badRequest("ID is required");
    }

    const data = await findData(req.params.id);
    if (!data) {
      throw APIError.notFound("Data not found");
    }

    if (!canAccess(req.authUser, data)) {
      throw APIError.forbidden("Access denied");
    }

    // Rate limiting
    if (await isRateLimited(req)) {
      throw APIError.tooManyRequests("Please wait before trying again");
    }

    // Server errors (5xx)
    try {
      return await processData(data);
    } catch (error) {
      throw APIError.internalServerError("Processing failed");
    }
  }
);
```

## Configuration Reference

### VectorConfigSchema

```typescript
interface VectorConfigSchema {
  // Server
  port?: number;              // Server port (default: 3000)
  hostname?: string;          // Server hostname (default: localhost)
  reusePort?: boolean;        // Reuse port (default: true)
  development?: boolean;      // Development mode
  routesDir?: string;         // Routes directory (default: ./routes)
  idleTimeout?: number;       // Idle timeout in seconds

  // CORS
  cors?: CorsOptions | boolean;

  // Handlers
  auth?: ProtectedHandler;    // Authentication handler
  cache?: CacheHandler;        // Cache handler

  // Middleware
  before?: BeforeMiddleware[]; // Pre-request middleware
  after?: AfterMiddleware[];    // Post-response middleware
}
```

### Example: Full Configuration

```typescript
// vector.config.ts
import type { VectorConfigSchema } from "vector-framework";
import { verifyJWT } from "./lib/auth";
import { redis } from "./lib/redis";

const config: VectorConfigSchema = {
  port: process.env.PORT || 3000,
  hostname: "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
  routesDir: "./api/routes",
  idleTimeout: 60,

  cors: {
    origin: ["https://example.com", "https://app.example.com"],
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    maxAge: 86400,
  },

  auth: async (request) => {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("No token provided");

    const user = await verifyJWT(token);
    if (!user) throw new Error("Invalid token");

    return user;
  },

  cache: async (key, factory, ttl) => {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const value = await factory();
    await redis.setex(key, ttl, JSON.stringify(value));
    return value;
  },

  before: [
    // Logging middleware
    async (request) => {
      request.startTime = Date.now();
      console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
      return request;
    },

    // Request ID middleware
    async (request) => {
      request.id = crypto.randomUUID();
      return request;
    },
  ],

  after: [
    // Response time header
    async (response, request) => {
      const duration = Date.now() - request.startTime;
      response.headers.set("X-Response-Time", `${duration}ms`);
      return response;
    },

    // Security headers
    async (response) => {
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Frame-Options", "DENY");
      return response;
    },
  ],
};

export default config;
```

## CLI Commands

```bash
# Development server with hot reload
bun vector dev

# Production server
bun vector start

# Build for production
bun vector build

# Command options
bun vector dev --port 4000         # Custom port
bun vector dev --host 0.0.0.0      # Custom host
bun vector dev --routes ./api      # Custom routes directory
bun vector dev --config ./custom.config.ts  # Custom config file
```

## Project Structure

```
my-app/
├── vector.config.ts      # Framework configuration
├── routes/              # Auto-discovered routes
│   ├── users.ts        # /users endpoints
│   ├── posts.ts        # /posts endpoints
│   └── admin/          # Nested routes
│       └── stats.ts    # /admin/stats endpoints
├── lib/                # Your libraries
│   ├── auth.ts
│   ├── db.ts
│   └── redis.ts
└── package.json
```

## Performance

Vector achieves exceptional performance through:

- **Bun Runtime**: Native TypeScript execution without transpilation
- **Minimal Dependencies**: Only itty-router (3KB) as dependency
- **Optimized Routing**: Efficient regex-based route matching
- **Smart Caching**: Built-in response caching with configurable TTL

Benchmarks show Vector handling **70,000+ requests/second** on standard hardware.

## Why Vector?

### For Encore Users
Love Encore's declarative API design but need more flexibility? Vector provides the same developer experience with the freedom to deploy anywhere Bun runs.

### For Express/Fastify Users
Tired of middleware chains and verbose configurations? Vector's declarative approach makes APIs cleaner and more maintainable.

### For New Projects
Starting fresh? Vector gives you production-ready features from day one with minimal configuration.

## Error Reference

Vector provides comprehensive error responses for all HTTP status codes. All errors return a consistent format:

```json
{
  "error": true,
  "message": "Error message",
  "statusCode": 400,
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Client Errors (4xx)

```typescript
import { APIError } from "vector-framework";

// 400 Bad Request
APIError.badRequest("Invalid input data");

// 401 Unauthorized
APIError.unauthorized("Authentication required");

// 402 Payment Required
APIError.paymentRequired("Subscription expired");

// 403 Forbidden
APIError.forbidden("Access denied");

// 404 Not Found
APIError.notFound("Resource not found");

// 405 Method Not Allowed
APIError.methodNotAllowed("POST not allowed on this endpoint");

// 406 Not Acceptable
APIError.notAcceptable("Cannot produce requested content type");

// 408 Request Timeout
APIError.requestTimeout("Request took too long");

// 409 Conflict
APIError.conflict("Resource already exists");

// 410 Gone
APIError.gone("Resource permanently deleted");

// 411 Length Required
APIError.lengthRequired("Content-Length header required");

// 412 Precondition Failed
APIError.preconditionFailed("ETag mismatch");

// 413 Payload Too Large
APIError.payloadTooLarge("Request body exceeds limit");

// 414 URI Too Long
APIError.uriTooLong("URL exceeds maximum length");

// 415 Unsupported Media Type
APIError.unsupportedMediaType("Content-Type not supported");

// 416 Range Not Satisfiable
APIError.rangeNotSatisfiable("Requested range cannot be satisfied");

// 417 Expectation Failed
APIError.expectationFailed("Expect header requirements not met");

// 418 I'm a Teapot
APIError.imATeapot("I refuse to brew coffee");

// 421 Misdirected Request
APIError.misdirectedRequest("Request sent to wrong server");

// 422 Unprocessable Entity
APIError.unprocessableEntity("Validation failed");

// 423 Locked
APIError.locked("Resource is locked");

// 424 Failed Dependency
APIError.failedDependency("Dependent request failed");

// 425 Too Early
APIError.tooEarly("Request is too early");

// 426 Upgrade Required
APIError.upgradeRequired("Protocol upgrade required");

// 428 Precondition Required
APIError.preconditionRequired("Precondition headers required");

// 429 Too Many Requests
APIError.tooManyRequests("Rate limit exceeded");

// 431 Request Header Fields Too Large
APIError.requestHeaderFieldsTooLarge("Headers too large");

// 451 Unavailable For Legal Reasons
APIError.unavailableForLegalReasons("Content blocked for legal reasons");
```

### Server Errors (5xx)

```typescript
// 500 Internal Server Error
APIError.internalServerError("Something went wrong");

// 501 Not Implemented
APIError.notImplemented("Feature not yet available");

// 502 Bad Gateway
APIError.badGateway("Upstream server error");

// 503 Service Unavailable
APIError.serviceUnavailable("Service temporarily down");

// 504 Gateway Timeout
APIError.gatewayTimeout("Upstream server timeout");

// 505 HTTP Version Not Supported
APIError.httpVersionNotSupported("HTTP/3 not supported");

// 506 Variant Also Negotiates
APIError.variantAlsoNegotiates("Content negotiation error");

// 507 Insufficient Storage
APIError.insufficientStorage("Server storage full");

// 508 Loop Detected
APIError.loopDetected("Infinite loop detected");

// 510 Not Extended
APIError.notExtended("Extension required");

// 511 Network Authentication Required
APIError.networkAuthenticationRequired("Network login required");
```

### Convenience Aliases

```typescript
// Alias for 422 Unprocessable Entity
APIError.invalidArgument("Field 'email' is required");

// Alias for 429 Too Many Requests
APIError.rateLimitExceeded("Try again in 60 seconds");

// Alias for 503 Service Unavailable
APIError.maintenance("Scheduled maintenance in progress");
```

### Custom Errors

```typescript
// Create error with any status code
APIError.custom(456, "Custom error message");

// With custom content type
APIError.custom(400, "Invalid XML", "application/xml");
```

### Usage in Routes

```typescript
export const example = route(
  { method: "POST", path: "/api/users" },
  async (req) => {
    // Validation errors
    if (!req.content?.email) {
      throw APIError.badRequest("Email is required");
    }

    if (!isValidEmail(req.content.email)) {
      throw APIError.unprocessableEntity("Invalid email format");
    }

    // Authentication errors
    if (!req.authUser) {
      throw APIError.unauthorized("Please login first");
    }

    if (req.authUser.role !== "admin") {
      throw APIError.forbidden("Admin access required");
    }

    // Resource errors
    const existingUser = await findUserByEmail(req.content.email);
    if (existingUser) {
      throw APIError.conflict("Email already registered");
    }

    // Rate limiting
    if (await checkRateLimit(req.authUser.id)) {
      throw APIError.tooManyRequests("Maximum 5 users per hour");
    }

    try {
      const user = await createUser(req.content);
      return { user };
    } catch (error) {
      // Database errors
      if (error.code === "STORAGE_FULL") {
        throw APIError.insufficientStorage("Database full");
      }

      // Generic server error
      throw APIError.internalServerError("Failed to create user");
    }
  }
);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT