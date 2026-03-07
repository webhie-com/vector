# PR Review Progress

## 2026-03-07

### Scope

- Verify `config.defaults.route` behavior still works.
- Expand schema validation coverage with edge-case specs.

### Changes Made

- Added route-default coverage in `tests/router.test.ts`:
  - `rawRequest` default + explicit override behavior.
  - `rawResponse` default + explicit override behavior.
  - `validateRawRequest` default behavior when `rawRequest` default is enabled.
  - `Vector.startServer()` wiring assertion that `config.defaults.route` is forwarded to router defaults.
- Added schema-validation edge-case integration specs in `tests/router-integration.test.ts`:
  - `cause.issues` mapping to 422.
  - transformed query/cookies with body omitted from validated output.
  - non-object validated output handling.
  - GET request validation payload behavior.
- Added schema utility edge-case specs in `tests/schema-validation.test.ts`:
  - empty `issues` array behavior.
  - validator return shape with no `issues`/`value`.
  - malformed thrown issue shapes.
  - mixed primitive path normalization.

### Validation Run

- `bun run typecheck`
- `bun test tests/router.test.ts tests/router-integration.test.ts tests/schema-validation.test.ts`
- `bun run test` (full configured suite)

### Result

- All targeted checks passed.
- Full configured suite failed only in `tests/middleware-integration.test.ts` due environment bind errors on `port: 0` (`EADDRINUSE`), including pre-existing tests unrelated to this change set.

## 2026-03-07 (README Reorganization)

### Goal
- Make the main README easier to scan and less intimidating.
- Move detailed reference material into a dedicated `docs/` folder.

### Work Completed
- Replaced `README.md` with a concise landing-page format:
  - value proposition
  - installation
  - quick start
  - optional validation/OpenAPI setup
  - documentation index links
  - examples, contributing, license
- Added detailed documentation pages:
  - `docs/README.md`
  - `docs/configuration.md`
  - `docs/routing.md`
  - `docs/typescript.md`
  - `docs/schema-validation.md`
  - `docs/openapi.md`
  - `docs/cli-and-discovery.md`
  - `docs/errors.md`
  - `docs/migration.md`
  - `docs/performance.md`

### Result
- Main README reduced from 864 lines to 142 lines.
- Deep-dive content is now organized by topic and linked from the main README.

## 2026-03-07 (Router/Server Performance Audit)

### Scope
- Review `src/core/router.ts` and `src/core/server.ts` for obvious hot-path regressions.

### Findings
- `router.prepareRequest()` was eagerly parsing query params for every request, even when handlers/middleware never read `req.query`.
  - This sat on the request hot path for all matched routes.
- `server.ts` did not show a comparable matched-route hot-path regression; fallback logic (`fetch`) only handles unmatched routes and built-in docs endpoints.

### Changes Made
- Optimized `router.prepareRequest()` to lazily materialize `req.query` only when accessed.
- Kept assignment compatibility by defining both getter and setter for `query`.
- Minor hot-path cleanup in `wrapHandler()` by removing indirection closures for CORS lookups.

### Validation
- `bun run typecheck`
- `bun test tests/router.test.ts tests/request-properties.test.ts tests/router-integration.test.ts`

All passed.

### Microbench (local synthetic)
Using an internal loop benchmark against wrapped route handlers (`N=50000`):

- Before:
  - no query: `83.8ms`
  - with query: `113.11ms`
- After:
  - no query: `~64-65ms`
  - with query: `~59-61ms`

This indicates a meaningful reduction in per-request overhead in the router hot path.
