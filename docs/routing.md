# Routing and Request API

Use `route()` to define endpoints in route files.

## Route Definition

```ts
import { route } from "vector-framework";
import { z } from "zod";

export const getUser = route(
  {
    method: "GET",
    path: "/users/:id",
    schema: {
      input: z.object({
        params: z.object({ id: z.string() }),
      }),
    },
  },
  async (ctx) => {
    return { id: ctx.validatedInput.params.id };
  },
);
```

## Route Options

```ts
interface RouteOptions {
  method: string;
  path: string;
  expose?: boolean;
  auth?: boolean | AuthKind;
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

Each handler receives a `VectorContext` object:

- `ctx.request`: native `Request`
- `ctx.params`: route params object (default `{}`)
- `ctx.query`: parsed query object from URL (default `{}`)
- `ctx.cookies`: parsed cookies object from `cookie` header (default `{}`)
- `ctx.content`: parsed request body (non-raw, non-GET/HEAD)
- `ctx.validatedInput`: validator output (`schema.input`)
- `ctx.authUser`: auth payload for `auth: true` routes
- `ctx.metadata`: route metadata from options (always present; defaults to `{}`)
- `ctx.<customField>`: your own per-request values set in middleware/hooks

## Raw Request and Raw Response

- `rawRequest: true` skips body parsing.
- `rawResponse: true` returns raw handler output (no JSON wrapping).
- `validate: false` disables `schema.input` validation for the route (raw and non-raw requests).

## Params, Query, Cookies

- `ctx.params`, `ctx.query`, and `ctx.cookies` are always available on context.
- When `schema.input` is enabled, prefer `ctx.validatedInput.params|query|cookies` for validated/coerced values.
- Use `ctx.params|query|cookies` for baseline access when no schema is defined.

## Caching

- `cache: 60` caches handler output for 60 seconds.
- `cache: { ttl: 60, key: 'custom-key' }` uses a custom cache key.

## Authentication

When `auth` is truthy (`true` or an `AuthKind` enum value), Vector invokes your configured auth handler before running the route.
If `defaults.route.auth` is an `AuthKind`, `auth: true` routes inherit that kind for OpenAPI security generation.

If auth fails, a `401` response is returned.

`AuthKind` also controls OpenAPI `securitySchemes` generation for the route.
