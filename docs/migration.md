# Migration Notes

## Schema and Validation

- Existing routes without `schema` continue to work.
- `schema` is optional, and both `schema.input` and `schema.output` are optional.
- `schema.input` failures return `422` with normalized issue payload.
- Validation runs when `schema.input` exists unless `validate: false`.

## Route Defaults

Use `defaults.route` in `vector.config.ts` to set global route booleans:

- `auth`
- `expose`
- `rawRequest`
- `validate`
- `rawResponse`

Route-level options always override defaults.

## OpenAPI and Docs Paths

- OpenAPI JSON path is reserved when OpenAPI is enabled.
- Docs UI path is reserved only when docs UI is enabled.

## Runtime

Vector is Bun-first. Ensure your deployment/runtime environment supports Bun.
