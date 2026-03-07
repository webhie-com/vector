# TypeScript Types

Vector supports typed auth/context/metadata via `VectorTypes`.

## Define App Types

```ts
import type { VectorConfigSchema, VectorTypes } from 'vector-framework';

interface MyUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

interface AppTypes extends VectorTypes {
  auth: MyUser;
}

const config: VectorConfigSchema<AppTypes> = {
  auth: async () => ({
    id: 'u1',
    email: 'admin@example.com',
    role: 'admin',
  }),
};

export default config;
export type { AppTypes };
```

## Typed Routes

```ts
import { route, APIError } from 'vector-framework';
import type { AppTypes } from '../vector.config';

export const adminOnly = route<AppTypes>(
  {
    method: 'GET',
    path: '/admin',
    auth: true,
    expose: true,
  },
  async (req) => {
    if (req.authUser?.role !== 'admin') {
      throw APIError.forbidden('Admin access required');
    }

    return { user: req.authUser.email };
  }
);
```

## Schema-Inferred Input Types

When `schema.input` is provided, request fields are inferred from validator output:

- `req.content`
- `req.body`
- `req.params`
- `req.query`
- `req.cookies`
- `req.validatedInput`

This lets route handlers consume normalized values with strong typing.
