import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { VectorServer } from '../src/core/server';
import { Vector, getVectorInstance } from '../src/core/vector';
import { startVector } from '../src/start-vector';

const tempFiles: string[] = [];

describe('startVector', () => {
  let originalStart: typeof VectorServer.prototype.start;

  beforeEach(() => {
    Vector.resetInstance();
    originalStart = VectorServer.prototype.start;
    (VectorServer.prototype as any).start = async function () {
      return { port: 3000 } as any;
    };
  });

  afterEach(() => {
    (VectorServer.prototype as any).start = originalStart;
    Vector.resetInstance();
    for (const file of tempFiles.splice(0)) {
      try {
        rmSync(file, { force: true });
      } catch {}
    }
  });

  it('loads handlers from config and returns lifecycle helpers', async () => {
    const tempPath = join(process.cwd(), `.tmp.vector.start.config.${Date.now()}.mjs`);
    tempFiles.push(tempPath);

    await Bun.write(
      tempPath,
      `
      export default {
        auth: async () => ({ id: "user_1" }),
        cache: async (_key, factory) => factory(),
      };
    `
    );

    const app = await startVector({ configPath: tempPath, autoDiscover: false });
    const vector = getVectorInstance();

    expect(app.server.port).toBe(3000);
    expect(typeof app.stop).toBe('function');
    expect(typeof app.shutdown).toBe('function');
    expect(vector.getProtectedHandler()).not.toBeNull();
    expect(vector.getCacheHandler()).not.toBeNull();

    app.stop();
  });

  it('supports config mutation context and override precedence', async () => {
    const tempPath = join(process.cwd(), `.tmp.vector.start.override.${Date.now()}.mjs`);
    tempFiles.push(tempPath);

    await Bun.write(
      tempPath,
      `
      export default {
        port: 1111
      };
    `
    );

    const app = await startVector({
      configPath: tempPath,
      autoDiscover: false,
      mutateConfig: (config, context) => {
        expect(context.configSource).toBe('user');
        return { ...config, port: 2222 };
      },
      config: {
        port: 3333,
      },
    });

    expect(app.config.port).toBe(3333);
    app.stop();
  });

  it('allows explicitly clearing handlers', async () => {
    const withHandlersPath = join(process.cwd(), `.tmp.vector.start.with.handlers.${Date.now()}.mjs`);
    const withoutHandlersPath = join(process.cwd(), `.tmp.vector.start.without.handlers.${Date.now()}.mjs`);
    tempFiles.push(withHandlersPath, withoutHandlersPath);

    await Bun.write(
      withHandlersPath,
      `
      export default {
        auth: async () => ({ id: "user_1" }),
        cache: async (_key, factory) => factory(),
      };
    `
    );

    await Bun.write(
      withoutHandlersPath,
      `
      export default {
        port: 3000
      };
    `
    );

    const vector = getVectorInstance();

    const firstApp = await startVector({ configPath: withHandlersPath, autoDiscover: false });
    expect(vector.getProtectedHandler()).not.toBeNull();
    expect(vector.getCacheHandler()).not.toBeNull();
    firstApp.stop();

    const secondApp = await startVector({
      configPath: withoutHandlersPath,
      autoDiscover: false,
      protectedHandler: null,
      cacheHandler: null,
    });

    expect(vector.getProtectedHandler()).toBeNull();
    expect(vector.getCacheHandler()).toBeNull();
    secondApp.stop();
  });
});
