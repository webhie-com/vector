import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { VectorServer } from '../src/core/server';
import { Vector, getVectorInstance } from '../src/core/vector';

describe('startup hook', () => {
  let originalStart: typeof VectorServer.prototype.start;

  beforeEach(() => {
    Vector.resetInstance();
    originalStart = VectorServer.prototype.start;
  });

  afterEach(() => {
    (VectorServer.prototype as any).start = originalStart;
    Vector.resetInstance();
  });

  it('runs startup before server start', async () => {
    let startupComplete = false;
    let startCalled = false;

    (VectorServer.prototype as any).start = async function () {
      startCalled = true;
      expect(startupComplete).toBe(true);
      return { port: 3000 } as any;
    };

    const vector = getVectorInstance();
    await vector.startServer({
      autoDiscover: false,
      startup: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        startupComplete = true;
      },
    });

    expect(startCalled).toBe(true);
    vector.stop();
  });

  it('bubbles startup errors and skips server start', async () => {
    let startCalled = false;

    (VectorServer.prototype as any).start = async function () {
      startCalled = true;
      return { port: 3000 } as any;
    };

    const vector = getVectorInstance();
    await expect(
      vector.startServer({
        autoDiscover: false,
        startup: async () => {
          throw new Error('startup failed');
        },
      })
    ).rejects.toThrow('startup failed');

    expect(startCalled).toBe(false);
    vector.stop();
  });
});
