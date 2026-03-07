# OpenAPI + Schema Support Working Plan (Planning Only)

Last updated: 2026-03-06
Owner: Vector framework team
Status: Planning

## Purpose
Track the work required to add OpenAPI generation to Vector by letting users declare endpoint schemas via a `schema` object (starting with Zod ergonomics), while remaining compatible with multiple schema libraries through Standard Schema specs.

## Scope (This Document)
- We are only planning.
- No implementation changes are included in this phase.
- This document is the single source of progress tracking for this effort.

## Local Spec Source
- Vendored Standard Schema definitions: `vendor/standard-schema/spec.ts`
- Provenance note: `vendor/standard-schema/README.md`

## Current Baseline (from README + source)
- Current route API is `route(options, handler)`.
- `RouteOptions` has no schema fields yet (`method`, `path`, `auth`, `expose`, `cache`, `rawRequest`, `rawResponse`, `responseContentType`, `metadata`).
- Request parsing exists (`req.content`, `req.params`, `req.query`, `req.headers`) but no built-in validation.
- Route auto-discovery already captures `route.options` in `RouteScanner` / `GeneratedRoute`, which is a good foundation for doc generation.
- No OpenAPI endpoint currently exists.

## Goal Summary
1. Define a clean way for users to declare endpoint schemas in route definitions.
2. Confirm compatibility strategy using:
   - Standard Schema (`StandardSchemaV1`) for validation
   - Standard JSON Schema (`StandardJSONSchemaV1`) for OpenAPI schema generation
3. Generate and serve OpenAPI docs from user-defined route schemas.

## Proposed User-Facing API (Draft)

### Draft route ergonomics (preferred direction)
```ts
import { route } from "vector-framework";
import { z } from "zod";

const CreateUserInput = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
  }),
});

const UserResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

export const createUser = route({
  method: "POST",
  path: "/users",
  schema: {
    input: CreateUserInput,
    output: {
      201: UserResponse,
      400: z.object({ error: z.literal(true), message: z.string() }),
    },
  },
}, async (req) => {
  // req.content should be typed from input schema output when possible
  return { id: "usr_1", email: req.content.email, name: req.content.name };
});
```

### Final schema shape (to implement)
```ts
schema?: {
  input?: ...,
  output?: ...
}
```

Notes:
- `schema` is optional.
- `schema.input` is optional.
- `schema.output` is optional.
- `schema.input` and `schema.output` retain the same meanings as previously proposed top-level `input` and `output`.

## Standards Compatibility Plan

### Standard Schema (`StandardSchemaV1`)
Use for runtime validation:
- Detect support via `schema['~standard']?.validate`.
- Call `validate(value)` and normalize issues to framework error shape.
- Use inferred types where possible for handler typing.

### Standard JSON Schema (`StandardJSONSchemaV1`)
Use for OpenAPI generation:
- Detect support via `schema['~standard']?.jsonSchema?.input/output`.
- Generate schemas using a configurable target.
- Default target: `openapi-3.0`.
- If unsupported or conversion throws: omit that schema from OpenAPI and emit warning.

Important:
- `StandardJSONSchemaV1` is optional for accepting route schemas.
- Route schema acceptance should be based on `StandardSchemaV1` (validation).
- OpenAPI generation should be capability-based using only direct `StandardJSONSchemaV1` support (no adapters).

### Practical compatibility expectations
- If schema supports validation but not JSON schema conversion: runtime validation still works, docs show limited schema or explicit warning.
- If schema supports JSON schema conversion but no validation: docs generation works, runtime validation optional (config-driven).
- Best experience when a schema supports both specs.

### Capability policy (proposed)
1. Accept `schema.input` / `schema.output` if they implement `StandardSchemaV1`.
2. For OpenAPI, first try direct `StandardJSONSchemaV1` conversion.
3. If conversion is unavailable, keep route valid and include the endpoint in OpenAPI without derived schema details (with warning).

### Compatibility notes (as of 2026-03-06, based on standardschema.dev)
- Strong `StandardSchemaV1` support: Zod, Valibot, ArkType (and others).
- `StandardJSONSchemaV1` support is narrower across libraries.
- Conclusion: use `StandardSchemaV1` as the baseline contract; for docs, only consume direct `StandardJSONSchemaV1` when present.

## Validation Handling Across Libraries (Examples)

### Framework-level validation flow (library-agnostic)
```ts
// Pseudocode for runtime validation used by Vector
async function validateInput(schema: unknown, value: unknown) {
  const standard = (schema as any)?.["~standard"];
  if (!standard || typeof standard.validate !== "function") {
    throw new Error("Schema does not implement StandardSchemaV1");
  }

  const result = await standard.validate(value);
  if (result.issues) {
    return { ok: false, issues: result.issues };
  }
  return { ok: true, value: result.value };
}
```

### Zero-config error behavior (proposed defaults)
- Validation always runs through `schema["~standard"].validate(...)`.
- Missing `schema`: skip validation.
- Invalid schema object (no `~standard.validate`): return `500` with framework error `"Invalid route schema configuration"`.
- Validation issues returned by schema: return `422` with normalized payload.
- Throwing validator function: return `422` with normalized payload if issues can be extracted, otherwise `500`.
- Unknown validation exception: return `500`.
- Response schema validation failure (if enabled): return `500` by default, since this is a server contract bug.

Proposed normalized validation error shape:
```json
{
  "error": true,
  "message": "Validation failed",
  "statusCode": 422,
  "source": "validation",
  "target": "input",
  "issues": [
    {
      "message": "Invalid email",
      "path": ["body", "email"],
      "code": "invalid_string"
    }
  ],
  "timestamp": "2026-03-06T00:00:00.000Z"
}
```

Normalization rules (zero config):
- `path`: always array of path segments (`string | number`), fallback `[]`.
- `message`: always string, fallback `"Invalid value"`.
- `code`: optional string, pass-through when present.
- Preserve original issue payload under `raw` only in development mode.

### Zod example
```ts
import { z } from "zod";

const CreateUserInput = z.object({
  body: z.object({ email: z.string().email(), name: z.string().min(1) }),
});
```

### Valibot example
```ts
import * as v from "valibot";

const CreateUserInput = v.object({
  body: v.object({
    email: v.pipe(v.string(), v.email()),
    name: v.pipe(v.string(), v.minLength(1)),
  }),
});
```

### ArkType example
```ts
import { type } from "arktype";

const CreateUserInput = type({
  body: {
    email: "string.email",
    name: "string>0",
  },
});
```

### Route example with optional schema sections
```ts
export const createUser = route({
  method: "POST",
  path: "/users",
  schema: {
    input: CreateUserInput,  // optional
    output: UserResponseMap, // optional
  },
}, async (req) => {
  return { id: "usr_1", email: req.content.email, name: req.content.name };
});
```

## OpenAPI Output Plan

### Generation strategy
- Source of truth: discovered route definitions + route options schema metadata.
- Build an OpenAPI document during startup (or lazily on first request).
- Include:
  - `paths`, methods
  - parameters (path/query/header/cookie)
  - request body
  - responses by status
  - reusable components/schemas where possible

### Endpoint exposure
- Add built-in docs endpoints (configurable):
  - `GET /openapi.json` (raw spec)
  - `GET /docs` (human-readable docs page, optional)
- Add config flags to enable/disable and customize paths.

Zero-config defaults:
- Development: expose `GET /openapi.json` by default.
- Production: disable docs endpoints by default for safety (opt-in).
- Only include routes where `expose !== false` in generated OpenAPI.
- `GET /docs` is disabled by default in all environments unless explicitly enabled.

## Implementation Plan (Phased Checklist)

### Phase 0: Design Finalization
- [x] Review README route ergonomics and current internals.
- [x] Confirm baseline route/type limitations.
- [x] Decide final schema API shape (`schema` with optional `input` and optional `output`).
- [x] Decide error behavior for unsupported schema capabilities.
- [x] Decide default OpenAPI target and fallback behavior.

### Phase 1: Type System Extensions
- [x] Extend `RouteOptions` with `schema?: { input?: ...; output?: ... }`.
- [x] Add framework-level schema type aliases/interfaces.
- [x] Ensure typed request/response inference remains backwards compatible.

### Phase 2: Runtime Validation Layer
- [x] Implement schema capability detection helpers.
- [x] Validate input payload sections before handler execution.
- [x] Normalize validation failures to default `422` with framework-wide issue shape.
- [x] Ensure `rawRequest` routes bypass automatic validation unless explicitly enabled (`validateRawRequest`).
- [x] Decide whether response validation is on/off by default (default: off; enable in a later phase when output-schema behavior is implemented).

### Phase 3: Spec Extraction + OpenAPI Builder
- [x] Collect schema metadata from all loaded routes.
- [x] Convert schema objects to JSON Schema via Standard JSON Schema interface.
- [x] Build deterministic OpenAPI document.
- [x] Handle unsupported conversions with warnings (not hard crash by default).

### Phase 4: Docs Endpoints + Config
- [x] Add config section for docs/openapi endpoint settings.
- [x] Register docs routes in server/router lifecycle.
- [x] Ensure docs endpoints are excluded from route auto-scan conflicts.

### Phase 5: Tests
- [x] Unit tests for schema detection and validation helpers.
- [x] Router integration tests for validation pass/fail flows.
- [x] OpenAPI generation tests from fixture routes.
- [x] Endpoint tests for `/openapi.json` (+ `/docs` if included).
- [x] Backward compatibility tests for routes with no schema declarations.

### Phase 6: Documentation + Examples
- [x] Update README quick-start with schema-enabled endpoint examples.
- [x] Add migration notes for existing users.
- [x] Add compatibility matrix (Zod/Valibot/ArkType/etc via standards).

## Candidate File Touch List (for implementation phase)
- `src/types/index.ts`
- `src/core/router.ts`
- `src/core/vector.ts`
- `src/core/server.ts`
- `src/dev/route-scanner.ts`
- `src/index.ts`
- `README.md`
- `tests/*` (new + updates)

## Decisions Log
- [x] Decision: Route schema API shape (`schema?: { input?: ...; output?: ... }`)
- [x] Decision: No custom adapters for validation or OpenAPI conversion (standards-only policy)
- [x] Decision: Validation failure status code strategy (default `422` for input validation issues)
- [x] Decision: OpenAPI target default (`openapi-3.0`; on unsupported conversion, omit schema + warn)
- [x] Decision: Docs endpoint defaults and security posture
  Default: `GET /openapi.json` enabled in development, disabled in production unless opted in; `GET /docs` disabled by default.
- [x] Decision: Response schema validation default is `off` until output validation is explicitly enabled in a later phase.

## Execution Sequence (Implementation Start)
1. Extend route/types for `schema.input` and `schema.output` with `StandardSchemaV1` typing.
2. Add runtime validation in router wrapper with normalized `422` issue responses.
3. Add schema capability checks for OpenAPI extraction (`StandardJSONSchemaV1` optional).
4. Build OpenAPI document generator and register `/openapi.json`.
5. Add tests (unit + integration + OpenAPI endpoint coverage).
6. Update README with zero-config examples and behavior notes.

## Risks / Unknowns
- `schema.input` and `schema.output` type inference can become complex with transformed schemas.
- Some spec-compliant validators may not support all JSON Schema targets.
- OpenAPI 3.0 vs 3.1 compatibility choices can impact downstream tooling.
- Auto-generated docs routes must not interfere with user-defined routes.

## Definition of Done
- Users can declare schemas on routes with `schema.input` and/or `schema.output` using clean ergonomics.
- Framework validates requests at runtime via Standard Schema-compatible validators.
- Framework generates OpenAPI spec from route schemas via Standard JSON Schema conversion.
- OpenAPI is accessible via framework-managed endpoint(s).
- README + tests cover happy paths, failure paths, and backward compatibility.

## References
- README examples in this repo (`README.md`)
- Standard Schema: https://standardschema.dev/schema
- Standard JSON Schema: https://standardschema.dev/json-schema
