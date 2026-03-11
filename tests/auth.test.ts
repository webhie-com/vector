import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import type { VectorContext } from '../src/types';

function makeContext(url = 'http://localhost/test'): VectorContext {
  return {
    request: new Request(url),
  } as VectorContext;
}

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager();
  });

  describe('setProtectedHandler / authenticate', () => {
    it('throws when no handler is configured', async () => {
      await expect(auth.authenticate(makeContext())).rejects.toThrow('Protected handler not configured');
    });

    it('throws when context.request is missing', async () => {
      auth.setProtectedHandler(async () => ({ id: 'u-1' }) as any);
      await expect(auth.authenticate({} as any)).rejects.toThrow('Authentication context is invalid: missing request');
    });

    it('calls the handler and returns the user', async () => {
      const user = { id: '1', role: 'admin' };
      auth.setProtectedHandler(async () => user);

      const result = await auth.authenticate(makeContext());
      expect(result).toEqual(user);
    });

    it('sets authUser on the context (not request)', async () => {
      const user = { id: '42' };
      auth.setProtectedHandler(async () => user);

      const ctx = makeContext();
      await auth.authenticate(ctx);

      expect(ctx.authUser).toEqual(user);
      expect((ctx.request as any).authUser).toBeUndefined();
    });

    it('wraps handler errors with "Authentication failed:" prefix', async () => {
      auth.setProtectedHandler(async () => {
        throw new Error('invalid token');
      });

      await expect(auth.authenticate(makeContext())).rejects.toThrow('Authentication failed: invalid token');
    });

    it('wraps non-Error throws', async () => {
      auth.setProtectedHandler(async () => {
        throw 'bad';
      });

      await expect(auth.authenticate(makeContext())).rejects.toThrow('Authentication failed: bad');
    });

    it('passes the context to the handler', async () => {
      let receivedContext: VectorContext | null = null;
      auth.setProtectedHandler(async (ctx) => {
        receivedContext = ctx;
        return { id: '1' };
      });

      const ctx = makeContext('http://localhost/protected');
      await auth.authenticate(ctx);

      expect(receivedContext).toBe(ctx);
      expect(receivedContext?.request.url).toBe('http://localhost/protected');
    });

    it('replacing the handler uses the new one', async () => {
      auth.setProtectedHandler(async () => ({ id: 'old' }));
      auth.setProtectedHandler(async () => ({ id: 'new' }));

      const result = await auth.authenticate(makeContext());
      expect((result as any).id).toBe('new');
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when authUser is not set', () => {
      expect(auth.isAuthenticated(makeContext())).toBe(false);
    });

    it('returns true after successful authentication', async () => {
      auth.setProtectedHandler(async () => ({ id: '1' }));
      const ctx = makeContext();
      await auth.authenticate(ctx);

      expect(auth.isAuthenticated(ctx)).toBe(true);
    });

    it('returns false when authUser is null', () => {
      const ctx = makeContext();
      (ctx as any).authUser = null;
      expect(auth.isAuthenticated(ctx)).toBe(false);
    });
  });

  describe('getUser', () => {
    it('returns null when authUser is not set', () => {
      expect(auth.getUser(makeContext())).toBeNull();
    });

    it('returns the authUser after authentication', async () => {
      const user = { id: '7', name: 'Alice' };
      auth.setProtectedHandler(async () => user);

      const ctx = makeContext();
      await auth.authenticate(ctx);

      expect(auth.getUser(ctx)).toEqual(user);
    });
  });
});
