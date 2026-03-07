# Routing and Request API

Use `route()` to define endpoints in route files.

## Route Definition

```ts
import { route } from "vector-framework";

export const getUser = route(
  { method: "GET", path: "/users/:id" },
  async (req) => {
    return { id: req.params.id };
  },
);
```

## Route Options

```ts
interface RouteOptions {
  method: string;
  path: string;
  expose?: boolean;
  auth?: boolean;
  cache?: number | { ttl: number; key?: string };
  rawRequest?: boolean;
  validate?: boolean;
  rawResponse?: boolean;
  responseContentType?: string;
  metadata?: unknown;
  schema?: {
    input?: StandardSchemaV1;
    output?:
      | Record<number | `${number}` | "default", StandardSchemaV1>
      | StandardSchemaV1;
  };
}
```

## Request Fields

Each handler receives `VectorRequest` with these common fields:

- `req.params`: path params
- `req.query`: query params
- `req.headers`: request headers
- `req.cookies`: parsed cookies
- `req.content` and `req.body`: parsed request body
- `req.validatedInput`: validator output when `schema.input` exists
- `req.authUser`: auth payload for `auth: true` routes
- `req.context`: mutable request context
- `req.metadata`: route metadata from options

## Raw Request and Raw Response

- `rawRequest: true` skips body parsing.
- `rawResponse: true` returns raw handler output (no JSON wrapping).
- `validate: false` disables `schema.input` validation for the route (raw and non-raw requests).

## Caching

- `cache: 60` caches handler output for 60 seconds.
- `cache: { ttl: 60, key: 'custom-key' }` uses a custom cache key.

## Authentication

When `auth: true`, Vector invokes your configured auth handler before running the route.

If auth fails, a `401` response is returned.
