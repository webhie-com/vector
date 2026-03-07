# CLI and Route Discovery

## CLI Commands

```bash
bun vector dev
bun vector start
bun vector build
```

`start` behavior:

- `start` requires a built app (`server.js` + sibling `routes/`).
- By default, `start` loads from `dist/server.js` and `dist/routes`.
- You can also run `bun run dist/server.js` directly; it defaults to `start` mode.
- `build` bakes serializable config values into `dist/server.js`; `start` uses that baked config by default.
- In `start`, explicit `--host` and `--port` flags override config/default values.
- In `start`, `--path` can target either a build directory (`server.js` + `routes/`) or a specific built server entry file.
- For custom builds, both `bun run <path>/server.js` and `bun vector start --path <path>` use the same build output.
- `start` does not allow `--config` or `--routes`; those must be set at build time.
- File watching is only enabled for `dev`; `start` does not watch files.
- Function-valued config fields are not baked (`auth`, `cache`, `before`, `after`, function `cors.origin`).

`build` behavior:

- Scans your `routesDir` and regenerates `./.vector/routes.generated.ts`.
- Produces `dist/server.js` for production startup by default.
- Compiles discovered route modules to `dist/routes/**/*.js` by default.
- `--path` changes the build output root (for example, `--path ./build` writes `./build/server.js` and `./build/routes`).
- `--config` and `--routes` are priority inputs for build and get baked into the output server.
- Build fails fast when explicit `--config`/`--routes` paths are invalid.
- Build prevents `--path` values that overlap your source routes directory.
- Build clears the target `routes/` output first to prevent stale route artifacts from previous builds.

## Build/Start Contract

### Build precedence

1. Config source:
   - `--config <path>` (highest priority)
   - `vector.config.ts` (default config file)
   - internal defaults
2. Routes source:
   - `--routes <dir>` (highest priority)
   - `config.routesDir`
   - `./routes`
3. Output path:
   - `--path <dir>`
   - `./dist`

### Start precedence

1. Build location:
   - `--path <dir|server.js>`
   - `./dist`
2. Network overrides:
   - `--host`, `--port` override baked values
3. Not allowed in start:
   - `--config`
   - `--routes`

Common options:

```bash
bun vector dev --port 4000
bun vector dev --host 0.0.0.0
bun vector dev --routes ./api
bun vector dev --config ./vector.config.ts
bun vector build --config ./vector.config.prod.ts --routes ./api
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
  routesDir: "./routes",
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
