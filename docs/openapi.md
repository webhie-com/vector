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
- `info`: OpenAPI info object fields

## Endpoints

- `GET /openapi.json`: returns generated document when enabled
- `GET /docs`: optional built-in docs UI when `openapi.docs.enabled` is `true`
- `GET /_vector/openapi/tailwindcdn.js`: internal docs UI asset endpoint (when docs UI is enabled)

## Notes

- Routes matching the OpenAPI JSON path are excluded from generated route docs.
- The docs UI path is excluded only when docs UI is enabled.
- When OpenAPI/docs are enabled, these built-in paths are reserved at startup.
- If a user route conflicts with a reserved path, server startup throws a clear error.
- No-body response statuses (e.g. `204`) are emitted without response content.
- Greedy route params and wildcards are normalized for OpenAPI templates.
