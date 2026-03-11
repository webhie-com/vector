# Error Reference

Use `APIError` helpers to return consistent error responses.

## Error Payload

```json
{
  "error": true,
  "message": "Error message",
  "statusCode": 400,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## Common Helpers

Client errors (4xx):

- `APIError.badRequest()`
- `APIError.unauthorized()`
- `APIError.forbidden()`
- `APIError.notFound()`
- `APIError.conflict()`
- `APIError.unprocessableEntity()`
- `APIError.tooManyRequests()`

Server errors (5xx):

- `APIError.internalServerError()`
- `APIError.notImplemented()`
- `APIError.badGateway()`
- `APIError.serviceUnavailable()`
- `APIError.gatewayTimeout()`

Aliases:

- `APIError.invalidArgument()` (422)
- `APIError.rateLimitExceeded()` (429)
- `APIError.maintenance()` (503)

Custom status:

- `APIError.custom(statusCode, message, contentType?)`

## Example

```ts
import { route, APIError } from "vector-framework";

export const createUser = route(
  { method: "POST", path: "/users", expose: true },
  async (ctx) => {
    if (!ctx.content?.email) {
      throw APIError.badRequest("Email is required");
    }

    if (!ctx.authUser) {
      throw APIError.unauthorized("Please login first");
    }

    return { ok: true };
  },
);
```
