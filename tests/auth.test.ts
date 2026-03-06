import { beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import type { VectorRequest } from '../src/types';

function makeRequest(url = 'http://localhost/test'): VectorRequest {
  return new Request(url) as unknown as VectorRequest;
}

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager();
  });

  describe('setProtectedHandler / authenticate', () => {
    it('throws when no handler is configured', async () => {
      const req = makeRequest();
      await expect(auth.authenticate(req)).rejects.toThrow('Protected handler not configured');
    });

    it('calls the handler and returns the user', async () => {
      const user = { id: '1', role: 'admin' };
      auth.setProtectedHandler(async () => user);

      const req = makeRequest();
      const result = await auth.authenticate(req);

      expect(result).toEqual(user);
    });

    it('sets authUser on the request', async () => {
      const user = { id: '42' };
      auth.setProtectedHandler(async () => user);

      const req = makeRequest();
      await auth.authenticate(req);

      expect(req.authUser).toEqual(user);
    });

    it('wraps handler errors with "Authentication failed:" prefix', async () => {
      auth.setProtectedHandler(async () => {
        throw new Error('invalid token');
      });

      const req = makeRequest();
      await expect(auth.authenticate(req)).rejects.toThrow('Authentication failed: invalid token');
    });

    it('wraps non-Error throws', async () => {
      auth.setProtectedHandler(async () => {
        throw 'bad';
      });

      const req = makeRequest();
      await expect(auth.authenticate(req)).rejects.toThrow('Authentication failed: bad');
    });

    it('passes the request to the handler', async () => {
      let receivedRequest: VectorRequest | null = null;
      auth.setProtectedHandler(async (req) => {
        receivedRequest = req;
        return { id: '1' };
      });

      const req = makeRequest('http://localhost/protected');
      await auth.authenticate(req);

      expect(receivedRequest).toBe(req);
    });

    it('replacing the handler uses the new one', async () => {
      auth.setProtectedHandler(async () => ({ id: 'old' }));
      auth.setProtectedHandler(async () => ({ id: 'new' }));

      const req = makeRequest();
      const result = await auth.authenticate(req);

      expect((result as any).id).toBe('new');
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when authUser is not set', () => {
      const req = makeRequest();
      expect(auth.isAuthenticated(req)).toBe(false);
    });

    it('returns true after successful authentication', async () => {
      auth.setProtectedHandler(async () => ({ id: '1' }));
      const req = makeRequest();
      await auth.authenticate(req);

      expect(auth.isAuthenticated(req)).toBe(true);
    });

    it('returns false when authUser is null', () => {
      const req = makeRequest();
      (req as any).authUser = null;
      expect(auth.isAuthenticated(req)).toBe(false);
    });
  });

  describe('getUser', () => {
    it('returns null when authUser is not set', () => {
      const req = makeRequest();
      expect(auth.getUser(req)).toBeNull();
    });

    it('returns the authUser after authentication', async () => {
      const user = { id: '7', name: 'Alice' };
      auth.setProtectedHandler(async () => user);

      const req = makeRequest();
      await auth.authenticate(req);

      expect(auth.getUser(req)).toEqual(user);
    });
  });
});
