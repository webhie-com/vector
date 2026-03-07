# OpenAPI and Docs UI

Vector can generate OpenAPI documents from registered routes.

## Enable OpenAPI

```ts
import type { VectorConfigSchema } from "vector-framework";

const config: VectorConfigSchema = {
  development: true,
  openapi: {
    enabled: true,
    path: "/openapi.json",
    target: "openapi-3.0",
    docs: false,
    info: {
      title: "My API",
      version: "1.0.0",
      description: "Example API",
    },
  },
};

export default config;
```

## OpenAPI Options

- `enabled`: defaults to `true` in development, `false` in production
- `path`: document endpoint (`/openapi.json` by default)
- `target`: output target (`openapi-3.0`, `draft-2020-12`, `draft-07`, or custom string)
- `docs`: `false` by default; enable to serve built-in docs UI
- `docs.exposePaths`: optional array of OpenAPI path strings/patterns to show in `/docs` (e.g. `["/health", "/users*"]`; `*` wildcard supported)
- `info`: OpenAPI info object fields

## Docs Path Filtering (`docs.exposePaths`)

Use `openapi.docs.exposePaths` when you want `/docs` to show only specific operations.

Behavior:

- `docs.enabled = true` and `docs.exposePaths` is omitted: show all exposed paths in `/docs`
- `docs.enabled = true` and `docs.exposePaths = []`: show all exposed paths in `/docs`
- `docs.enabled = true` and `docs.exposePaths` has entries: show only matching paths in `/docs`
- `GET /openapi.json` is not filtered by `docs.exposePaths`; it still includes all exposed paths

Wildcard rules:

- `*` matches any number of characters
- Matching is done against OpenAPI path keys (e.g. `/users/{id}`, not `/:id`)

Examples:

- `["/health"]` -> only `/health`
- `["/users*"]` -> `/users`, `/users/{id}`, `/users/search`
- `["*/health"]` -> `/v1/health`, `/internal/health`
- `["*"]` -> all paths

```ts
openapi: {
  enabled: true,
  path: "/openapi.json",
  docs: {
    enabled: true,
    path: "/docs",
    exposePaths: ["/health", "/users*"],
  },
}
```

## Endpoints

- `GET /openapi.json`: returns generated document when enabled
- `GET /docs`: optional built-in docs UI when `openapi.docs.enabled` is `true`

## Notes

- Routes matching the OpenAPI JSON path are excluded from generated route docs.
- The docs UI path is excluded only when docs UI is enabled.
- When OpenAPI/docs are enabled, these built-in paths are reserved at startup.
- If a user route conflicts with a reserved path, server startup throws a clear error.
- No-body response statuses (e.g. `204`) are emitted without response content.
- Greedy route params and wildcards are normalized for OpenAPI templates.
