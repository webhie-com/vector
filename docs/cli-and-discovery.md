# CLI and Route Discovery

## CLI Commands

```bash
bun vector dev
bun vector start
```

## Command Behavior

`dev` and `start` both run the server from source routes/config:

- Both support `--config`, `--routes`, `--port`, `--host`, and `--cors`.
- `start` sets `NODE_ENV=production`.
- `dev` enables file watching by default.
- `start` does not watch files.

Graceful shutdown:

- `vector dev` and `vector start` listen for `SIGINT` and `SIGTERM`.
- On shutdown signal, Vector stops accepting requests and then runs config `shutdown` (if provided).

## Programmatic Startup

For `bun run index.ts` style entrypoints, use `startVector()`:

```ts
import { startVector } from "vector-framework";

const app = await startVector({
  configPath: "./vector.config.ts",
});

// Graceful exit example
process.on("SIGTERM", async () => {
  await app.shutdown();
  process.exit(0);
});
```

- `startVector()` uses the same config loader behavior as CLI.
- It intentionally does not include file watching or hot reload.
- Use `app.stop()` for immediate stop (for your own reload tooling).

Common options:

```bash
bun vector dev --port 4000
bun vector dev --host 0.0.0.0
bun vector dev --routes ./api
bun vector dev --config ./vector.config.ts
bun vector start --config ./vector.config.prod.ts --routes ./api
```

## Route Discovery

Vector auto-discovers route files from `routesDir` (default `./routes`).

Default exclude patterns include:

- `*.test.ts`, `*.test.js`, `*.test.tsx`, `*.test.jsx`
- `*.spec.ts`, `*.spec.js`, `*.spec.tsx`, `*.spec.jsx`
- `*.tests.ts`, `*.tests.js`
- `**/__tests__/**`
- `*.interface.ts`, `*.type.ts`
- `*.d.ts`

Customize with `routeExcludePatterns`:

```ts
const config = {
  // string: route discovery root
  routesDir: "./routes",
  // string[]: glob patterns excluded from discovery
  routeExcludePatterns: [
    "*.test.ts",
    "*.spec.ts",
    "*.mock.ts",
    "**/__tests__/**",
    "_*.ts",
  ],
};
```

## Project Layout Example

```txt
my-app/
├── vector.config.ts
├── routes/
│   ├── users.ts
│   ├── posts.ts
│   └── admin/stats.ts
└── package.json
```
