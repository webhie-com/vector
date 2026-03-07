import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { VectorServer } from '../src/core/server';
import { Vector, getVectorInstance } from '../src/core/vector';

describe('shutdown hook', () => {
  let originalStart: typeof VectorServer.prototype.start;

  beforeEach(() => {
    Vector.resetInstance();
    originalStart = VectorServer.prototype.start;
  });

  afterEach(() => {
    (VectorServer.prototype as any).start = originalStart;
    Vector.resetInstance();
  });

  it('runs shutdown after stop', async () => {
    let shutdownCalled = false;

    (VectorServer.prototype as any).start = async function () {
      return { port: 3000 } as any;
    };

    const vector = getVectorInstance();
    await vector.startServer({
      autoDiscover: false,
      shutdown: async () => {
        shutdownCalled = true;
      },
    });

    expect(vector.getServer()).toBeTruthy();
    await vector.shutdown();
    expect(shutdownCalled).toBe(true);
    expect(vector.getServer()).toBeNull();
  });

  it('resolves when no shutdown hook is configured', async () => {
    (VectorServer.prototype as any).start = async function () {
      return { port: 3000 } as any;
    };

    const vector = getVectorInstance();
    await vector.startServer({
      autoDiscover: false,
    });

    await expect(vector.shutdown()).resolves.toBeUndefined();
    expect(vector.getServer()).toBeNull();
  });

  it('propagates shutdown hook failures', async () => {
    (VectorServer.prototype as any).start = async function () {
      return { port: 3000 } as any;
    };

    const vector = getVectorInstance();
    await vector.startServer({
      autoDiscover: false,
      shutdown: async () => {
        throw new Error('shutdown failed');
      },
    });

    await expect(vector.shutdown()).rejects.toThrow('shutdown failed');
    expect(vector.getServer()).toBeNull();
  });
});
