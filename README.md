# Vector Framework

**The speed of Bun. The developer experience you love.**

Vector brings the blazing performance of Bun to developers who appreciate the simplicity and elegance of frameworks like Encore. Build production-ready APIs with a familiar, declarative syntax while leveraging Bun's incredible speed.

## Why Vector?

If you've been looking for Encore-like developer experience with Bun's performance, Vector is your answer. Define your routes declaratively, enjoy automatic type safety, and ship faster than ever.

## Features

- **Fast & Lightweight** - Built on Bun and itty-router for maximum performance
- **Type-Safe** - Full TypeScript support with excellent type inference
- **Auto Route Discovery** - Automatically discovers and loads routes from your filesystem
- **Middleware System** - Flexible pre/post request middleware pipeline
- **Built-in Authentication** - Simple but powerful authentication system
- **Response Caching** - Automatic response caching with configurable TTL
- **CORS Support** - Configurable CORS with sensible defaults
- **Developer Experience** - Auto route discovery and CLI tools

## Quick Start

### Installation

```bash
bun add vector
```

### Your First API (Encore-style)

```typescript
// routes/hello.ts
import { route } from "vector";

// Public endpoint - clean and declarative
export const hello = route(
  {
    method: "GET",
    path: "/hello/:name",
    expose: true,
  },
  async (req) => {
    const { name } = req.params!;
    return { message: `Hello ${name}!` };
  }
);

// Protected endpoint - auth built-in
export const getProfile = route(
  {
    method: "GET",
    path: "/profile",
    expose: true,
    auth: true, // That's it! Auth handled.
  },
  async (req) => {
    return {
      user: req.authUser,
      lastLogin: new Date(),
    };
  }
);
```

### Start Your Server

```typescript
// server.ts
import vector from "vector";

// Set up auth (once, globally)
vector.protected = async (request) => {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  // Your auth logic here
  if (token === "valid-token") {
    return { id: "user-123", email: "user@example.com" };
  }
  throw new Error("Invalid token");
};

// Start server - routes auto-discovered from ./routes
vector.serve({ port: 3000 });
```

## Familiar Patterns, Modern Performance

### Real-World Example: User Service

```typescript
// routes/users.ts
import { route } from "vector";
import { db } from "../db";

// Public endpoint with caching
export const listUsers = route(
  {
    method: "GET",
    path: "/users",
    expose: true,
    cache: 300, // Cache for 5 minutes
  },
  async () => {
    const users = await db.user.findMany();
    return { users };
  }
);

// Protected endpoint with automatic body parsing
export const createUser = route(
  {
    method: "POST",
    path: "/users",
    expose: true,
    auth: true, // Auth required
  },
  async (req) => {
    const { name, email } = req.content; // Type-safe, auto-parsed

    const user = await db.user.create({
      data: { name, email },
    });

    return { user };
  }
);

// Parameter extraction made simple
export const getUser = route(
  {
    method: "GET",
    path: "/users/:id",
    expose: true,
  },
  async (req) => {
    const { id } = req.params!;
    const user = await db.user.findUnique({ where: { id } });

    if (!user) {
      throw new APIError("User not found", 404);
    }

    return { user };
  }
);
```

## Why Choose Vector?

### 🚀 Bun-Powered Performance

- **Native TypeScript** execution without transpilation overhead
- **Significantly faster** startup times and request handling
- **Minimal memory footprint** thanks to Bun's efficient runtime

### 💡 Developer Experience

- **Encore-inspired API** - If you know Encore, you already know Vector
- **Auto route discovery** - Just write your routes, we'll find them
- **Type safety everywhere** - Full TypeScript support
- **Built-in essentials** - Auth, caching, CORS, middleware - all included

### 🔄 Easy Migration

Moving from Express, Fastify, or Encore? Vector makes it simple:

```typescript
// Encore-style (what you know)
api.get("/hello/:name", async (name: string) => {
  return { message: `Hello ${name}!` };
});

// Vector-style (what you write)
export const hello = route(
  { method: "GET", path: "/hello/:name", expose: true },
  async (req) => {
    return { message: `Hello ${req.params.name}!` };
  }
);
```

## For Encore Users

Switching from Encore? You'll feel right at home. Vector provides the same declarative, type-safe API design with the performance benefits of Bun:

| Encore                         | Vector                                                |
| ------------------------------ | ----------------------------------------------------- |
| `api.get("/users", listUsers)` | `route({ method: 'GET', path: '/users' }, listUsers)` |
| `api.requireAuth()`            | `{ auth: true }` in route config                      |
| Auto-generated clients         | Not yet available                                     |
| Built-in tracing               | Middleware support                                    |
| Cloud deployment               | Deploy anywhere Bun runs                              |

**The key difference:** Vector runs on Bun, giving you significantly better performance and lower resource usage while maintaining the developer experience you love.

## CLI Commands

Vector includes a built-in CLI for development and production:

```bash
# Development server
bun run dev

# Production server
bun run start

# Run with custom options
bun run src/cli/index.ts dev --port 3000 --routes ./api
```

Or use npm scripts:

```bash
# Start development server
bun run dev

# Start production server
bun run start

# Build for production
bun run build
```

## Route Options

```typescript
interface RouteOptions {
  method: string; // HTTP method (GET, POST, etc.)
  path: string; // Route path with params (/users/:id)
  expose?: boolean; // Make route accessible (default: false)
  auth?: boolean; // Require authentication (default: false)
  cache?:
    | number
    | {
        // Cache configuration
        ttl: number; // Time to live in seconds
        key?: string; // Custom cache key
      };
  rawRequest?: boolean; // Skip body parsing (default: false)
  rawResponse?: boolean; // Return raw response (default: false)
  responseContentType?: string; // Response content type
}
```

## Middleware

### Before Middleware (Pre-handlers)

```typescript
const authMiddleware = async (request) => {
  // Modify request or return Response to short-circuit
  request.customData = "value";
  return request;
};

const rateLimitMiddleware = async (request) => {
  // Return Response to stop processing
  if (tooManyRequests) {
    return new Response("Too Many Requests", { status: 429 });
  }
  return request;
};
```

### Finally Middleware (Post-handlers)

```typescript
const corsMiddleware = async (response, request) => {
  // Modify response headers
  response.headers.set("X-Custom-Header", "value");
  return response;
};
```

## Authentication

Implement your authentication logic:

```typescript
vector.protected = async (request) => {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Invalid authorization header");
  }

  const token = authHeader.substring(7);
  const user = await validateToken(token);

  if (!user) {
    throw new Error("Invalid token");
  }

  return user; // This will be available as req.authUser
};
```

## Caching

Implement your caching strategy:

```typescript
vector.cache = async (key, factory, ttl) => {
  // Example with Redis
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const value = await factory();
  await redis.setex(key, ttl, JSON.stringify(value));

  return value;
};
```

## Configuration

```typescript
interface VectorConfig {
  port?: number; // Server port (default: 3000)
  hostname?: string; // Server hostname (default: localhost)
  reusePort?: boolean; // Reuse port (default: true)
  development?: boolean; // Development mode
  routesDir?: string; // Routes directory (default: ./routes)
}
```

### Middleware Configuration

```typescript
// Add before middleware (runs before routes)
vector.before(async (request) => {
  console.log(`${request.method} ${request.url}`);
  return request;
});

// Add finally middleware (runs after routes)
vector.finally(async (response, request) => {
  response.headers.set("X-Response-Time", Date.now() - request.startTime);
  return response;
});
```

## Project Structure

```
my-app/
├── routes/               # Auto-discovered routes
│   ├── users.ts
│   ├── posts.ts
│   └── health.ts
├── middleware/           # Custom middleware
│   ├── auth.ts
│   └── logging.ts
├── server.ts            # Main server file
└── package.json
```

## TypeScript Support

Vector is written in TypeScript and provides full type safety with customizable types:

```typescript
import { createVector, route, APIError } from "vector";
import type { VectorRequest, VectorTypes } from "vector";

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

// Create typed Vector instance
const vector = createVector<MyAppTypes>();

// Configure authentication with your custom type
vector.protected = async (request): Promise<MyUser> => {
  // Your auth logic here
  return {
    id: "user-123",
    email: "user@example.com",
    role: "admin",
    permissions: ["read", "write"],
  };
};

// Routes automatically have typed authUser
vector.route(
  { method: "GET", path: "/admin", expose: true, auth: true },
  async (request) => {
    // request.authUser is typed as MyUser
    if (request.authUser?.role !== "admin") {
      throw APIError.forbidden("Admin access required");
    }
    return { adminData: "..." };
  }
);
```

## Error Handling

Vector provides comprehensive built-in error responses for all HTTP status codes:

### Common Client Errors (4xx)

```typescript
import { APIError } from "vector";

// Basic errors
APIError.badRequest("Invalid input"); // 400
APIError.unauthorized("Please login"); // 401
APIError.forbidden("Access denied"); // 403
APIError.notFound("Resource not found"); // 404
APIError.conflict("Resource already exists"); // 409

// Validation and input errors
APIError.unprocessableEntity("Invalid data"); // 422
APIError.invalidArgument("Field required"); // 422 (alias)
APIError.payloadTooLarge("File too large"); // 413
APIError.unsupportedMediaType("Invalid type"); // 415

// Rate limiting and timeouts
APIError.tooManyRequests("Rate limit exceeded"); // 429
APIError.rateLimitExceeded("Try again later"); // 429 (alias)
APIError.requestTimeout("Request took too long"); // 408

// Method and protocol errors
APIError.methodNotAllowed("POST not allowed"); // 405
APIError.notAcceptable("Cannot produce response"); // 406
APIError.preconditionFailed("ETag mismatch"); // 412
```

### Server Errors (5xx)

```typescript
// Server errors
APIError.internalServerError("Something went wrong"); // 500
APIError.notImplemented("Feature coming soon"); // 501
APIError.badGateway("Upstream server error"); // 502
APIError.serviceUnavailable("Service down"); // 503
APIError.maintenance("Under maintenance"); // 503 (alias)
APIError.gatewayTimeout("Upstream timeout"); // 504
```

### Custom Errors

```typescript
// Create custom error with any status code
APIError.custom(456, 'Custom error message');

// All errors include additional metadata
// Response format:
{
  "error": true,
  "message": "Error message",
  "statusCode": 400,
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Usage in Routes

```typescript
vector.route(
  { method: "GET", path: "/api/data/:id", expose: true },
  async (req) => {
    // Validation
    if (!req.params?.id) {
      throw APIError.badRequest("ID is required");
    }

    // Check rate limits
    if (await isRateLimited(req)) {
      throw APIError.tooManyRequests("Please wait before trying again");
    }

    // Fetch data
    const data = await fetchData(req.params.id);
    if (!data) {
      throw APIError.notFound("Data not found");
    }

    // Check permissions
    if (!canAccess(req.authUser, data)) {
      throw APIError.forbidden("You cannot access this resource");
    }

    return data;
  }
);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
