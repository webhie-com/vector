# Schema Validation

Vector uses standards-based schema interfaces.

## Compatibility

- `schema.input` and `schema.output` must implement `StandardSchemaV1`
- OpenAPI conversion is attempted when schemas also expose `StandardJSONSchemaV1`
- No framework-specific adapters are required

Libraries like Zod, Valibot, and ArkType are usable when they expose the standard interfaces.

## Input Validation Behavior

If `schema.input` is defined:

- Validation runs before your route handler
- On failure, Vector returns `422 Unprocessable Entity`
- On success, validator output is assigned to `req.validatedInput`
- If validator output contains `body`, `params`, `query`, or `cookies`, those request fields are updated
- Validation payload includes `params`, `query`, `headers`, `cookies`, and `body`

Only define the fields you want to validate.
You do not need to add placeholder `any` shapes for sections you are not validating.

## Raw Requests

If `rawRequest: true`:

- Body parsing is skipped
- Validation still runs by default when `schema.input` exists
- Set `validateRawRequest: false` to skip validation in raw mode

## Output Schemas

`schema.output` can be:

- a status map, e.g. `{ 200: schemaA, 201: schemaB }`
- a shorthand schema (treated as default success output)

## Validation Error Shape

Input validation failures use this structure:

```json
{
  "error": true,
  "message": "Validation failed",
  "statusCode": 422,
  "source": "validation",
  "target": "input",
  "issues": [
    {
      "message": "Email is required",
      "path": ["body", "email"],
      "code": "required"
    }
  ],
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## Example (Zod)

```ts
import { route } from "vector-framework";
import { z } from "zod";

const Input = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({ name: z.string().min(1) }),
});

export const updateUser = route(
  {
    method: "PUT",
    path: "/users/:id",
    expose: true,
    schema: { input: Input },
  },
  async (req) => {
    return { id: req.params.id, name: req.content.name };
  },
);
```
