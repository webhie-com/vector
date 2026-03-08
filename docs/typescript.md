# TypeScript Types

Vector supports typed auth/context/metadata via `VectorTypes`.

## Define App Types

```ts
import type { VectorConfigSchema, VectorTypes } from "vector-framework";

interface MyUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

interface AppTypes extends VectorTypes {
  auth: MyUser;
}

const config: VectorConfigSchema<AppTypes> = {
  auth: async () => ({
    id: "u1",
    email: "admin@example.com",
    role: "admin",
  }),
};

export default config;
export type { AppTypes };
```

## Typed Routes

```ts
import { route, APIError } from "vector-framework";
import type { AppTypes } from "../vector.config";

export const adminOnly = route<AppTypes>(
  { method: "GET", path: "/admin", auth: true },
  async (req) => {
    if (req.authUser?.role !== "admin") {
      throw APIError.forbidden("Admin access required");
    }

    return { user: req.authUser.email };
  },
);
```

## Typed Utility Functions (Middleware-Safe)

If you pass request objects into shared helper functions (for example from `before` middleware), avoid hard-coding `DefaultVectorTypes`.

Use the same type you defined in your app config when you want app-specific typed data.

Use a generic helper instead:

```ts
import type { VectorRequest, VectorTypes } from "vector-framework";

export function sendNewRelicEvent<TTypes extends VectorTypes>(
  request: VectorRequest<TTypes>,
) {
  // read request fields safely across any app type
}
```

Then use it from typed config middleware:

```ts
import type { VectorConfigSchema, VectorTypes } from "vector-framework";
import { sendNewRelicEvent } from "./telemetry";

interface AppTypes extends VectorTypes {
  auth: { id: string; email: string };
}

const config: VectorConfigSchema<AppTypes> = {
  before: [
    async (request) => {
      sendNewRelicEvent(request);
      return request;
    },
  ],
};
```

If you want custom app fields to stay strongly typed (for example `authUser` shape), type the helper with your own `AppTypes`:

```ts
import type { VectorRequest } from "vector-framework";
import type { AppTypes } from "../vector.config";

export function sendNewRelicEvent(request: VectorRequest<AppTypes>) {
  // request.authUser is typed from your AppTypes.auth
}
```

Why this matters:

- `VectorRequest<AppTypes>` is not assignable to `VectorRequest<DefaultVectorTypes>`.
- If you want your custom typed data, use `AppTypes` in your function signature.
- Generic helpers (`<TTypes extends VectorTypes>`) work with both default and custom app types.

## Schema-Inferred Input Types

When `schema.input` is provided, request fields are inferred from validator output:

- `req.content`
- `req.body`
- `req.params`
- `req.query`
- `req.cookies`
- `req.validatedInput`

This lets route handlers consume normalized values with strong typing.
