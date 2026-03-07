# Vector Framework

Blazing fast, secure, and developer-friendly API framework for Bun.

Vector is a Bun-first framework for building HTTP APIs with declarative route files, strong TypeScript inference, and zero runtime dependencies.

- **Zero Dependencies**: No runtime routing dependency
- **Bun Native**: TypeScript-first workflow with the Bun runtime
- **Type Safe**: Typed request/auth/context with schema-driven validation
- **Built In**: Middleware, auth hooks, caching, CORS, OpenAPI generation

## Installation

```bash
bun add vector-framework
```

Requirements:

- Bun `>= 1.0.0`

## Quick Start

### 1. Create `vector.config.ts`

```ts
import type { VectorConfigSchema } from "vector-framework";

const config: VectorConfigSchema = {
  port: 3000,
  hostname: "localhost",
  development: process.env.NODE_ENV !== "production",
  routesDir: "./routes",
  defaults: {
    route: {
      expose: true,
      auth: false,
    },
  },
};

export default config;
```

### 2. Create a route file

```ts
// routes/hello.ts
import { route } from "vector-framework";

export const hello = route(
  { method: "GET", path: "/hello/:name", expose: true },
  async (req) => {
    return { message: `Hello ${req.params.name}` };
  },
);
```

### 3. Run the server

```bash
bun vector dev
```

Your API will be available at `http://localhost:3000`.

## Production Build and Start

```bash
bun vector build --config ./vector.config.ts --routes ./routes --path ./dist
bun vector start --path ./dist --port 8080 --host 0.0.0.0
```

Notes:

- `--config` and `--routes` are build-time inputs.
- `start` runs built artifacts (`server.js` + `routes/`) from `--path` (default `./dist`).
- `start` allows only runtime network overrides (`--port`, `--host`).
- Build/start currently bakes only serializable config values. Function-based hooks (`auth`, `cache`, `before`, `after`, function `cors.origin`) are not baked into `server.js`.

## Optional: Validation + OpenAPI

```bash
bun add -d zod
```

Vector is not tied to Zod. It supports any validation library that implements the
`StandardSchemaV1` interface (`~standard` v1).

Common compatible choices include:

- Zod (v4+)
- Valibot
- ArkType

For OpenAPI schema conversion, your library also needs `StandardJSONSchemaV1`
(`~standard.jsonSchema.input/output`). If those converters are missing, runtime
validation still works, but schema conversion is skipped.

```ts
import { route } from "vector-framework";
import { z } from "zod";

const CreateUserInput = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
  }),
});

const CreateUserSchema = { input: CreateUserInput };

export const createUser = route(
  { method: "POST", path: "/users", expose: true, schema: CreateUserSchema },
  async (req) => {
    return { created: true, email: req.content.email };
  },
);
```

Enable OpenAPI in `vector.config.ts`:

```ts
openapi: {
  enabled: true,
  path: '/openapi.json',
  docs: false,
}
```

## Documentation

Start here for deeper guides:

- [Docs Index](docs/README.md)
- [Configuration](docs/configuration.md)
- [Routing and Request API](docs/routing.md)
- [TypeScript Types](docs/typescript.md)
- [Schema Validation](docs/schema-validation.md)
- [OpenAPI and Docs UI](docs/openapi.md)
- [CLI and Route Discovery](docs/cli-and-discovery.md)
- [Error Reference](docs/errors.md)
- [Migration Notes](docs/migration.md)
- [Performance Notes](docs/performance.md)

## Examples

- [examples/routes/health.ts](examples/routes/health.ts)
- [examples/routes/events.ts](examples/routes/events.ts)
- [examples/routes/commerce.ts](examples/routes/commerce.ts)
- [tests/e2e/test-routes.ts](tests/e2e/test-routes.ts) (broader endpoint patterns)
- [tests/e2e/test-zod-routes.ts](tests/e2e/test-zod-routes.ts) (Zod + I/O validation flows)

## Contributing

Contributions are welcome. Open an issue or pull request.

## License

MIT
