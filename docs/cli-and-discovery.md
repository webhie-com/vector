# CLI and Route Discovery

## CLI Commands

```bash
bun vector dev
bun vector start
bun vector build
```

Common options:

```bash
bun vector dev --port 4000
bun vector dev --host 0.0.0.0
bun vector dev --routes ./api
bun vector dev --config ./vector.config.ts
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
  routesDir: './routes',
  routeExcludePatterns: [
    '*.test.ts',
    '*.spec.ts',
    '*.mock.ts',
    '**/__tests__/**',
    '_*.ts',
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
