import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AuthManager } from '../src/auth/protected';
import { CacheManager } from '../src/cache/manager';
import { VectorRouter } from '../src/core/router';
import { VectorServer } from '../src/core/server';
import { MiddlewareManager } from '../src/middleware/manager';

function makeRouter() {
  const middleware = new MiddlewareManager();
  const auth = new AuthManager();
  const cache = new CacheManager();
  return new VectorRouter(middleware, auth, cache);
}

describe('server idleTimeout configuration', () => {
  let originalServe: typeof Bun.serve;

  beforeEach(() => {
    originalServe = Bun.serve;
  });

  afterEach(() => {
    (Bun as any).serve = originalServe;
  });

  it('passes idleTimeout: 0 through to Bun.serve', async () => {
    const router = makeRouter();
    let capturedIdleTimeout: number | undefined;

    (Bun as any).serve = (options: any) => {
      capturedIdleTimeout = options.idleTimeout;
      return {
        port: options.port,
        hostname: options.hostname,
        stop() {},
      };
    };

    const server = new VectorServer(router, {
      development: true,
      idleTimeout: 0,
    });

    await server.start();
    expect(capturedIdleTimeout).toBe(0);
  });

  it('defaults idleTimeout to 60 when not provided', async () => {
    const router = makeRouter();
    let capturedIdleTimeout: number | undefined;

    (Bun as any).serve = (options: any) => {
      capturedIdleTimeout = options.idleTimeout;
      return {
        port: options.port,
        hostname: options.hostname,
        stop() {},
      };
    };

    const server = new VectorServer(router, {
      development: true,
    });

    await server.start();
    expect(capturedIdleTimeout).toBe(60);
  });
});
