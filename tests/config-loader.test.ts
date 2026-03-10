import { afterEach, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigLoader } from '../src/core/config-loader';

const tempFiles: string[] = [];

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    try {
      rmSync(file, { force: true });
    } catch {}
  }
});

describe('ConfigLoader', () => {
  it('maps routeExcludePatterns from vector.config.ts', async () => {
    const tempPath = join(process.cwd(), `.tmp.vector.config.${Date.now()}.mjs`);
    tempFiles.push(tempPath);

    await Bun.write(
      tempPath,
      `
      export default {
        routesDir: "./src/controllers",
        routeExcludePatterns: ["*.spec.ts", "*.spec.pause.ts"]
      };
    `
    );

    const loader = new ConfigLoader(tempPath);
    const config = await loader.load();

    expect(config.routesDir).toBe('./src/controllers');
    expect(config.routeExcludePatterns).toEqual(['*.spec.ts', '*.spec.pause.ts']);
  });

  it('maps all major config fields from VectorConfigSchema', async () => {
    const tempPath = join(process.cwd(), `.tmp.vector.config.full.${Date.now()}.mjs`);
    tempFiles.push(tempPath);

    await Bun.write(
      tempPath,
      `
      export default {
        port: 4321,
        hostname: "127.0.0.1",
        reusePort: false,
        development: true,
        routesDir: "./src/controllers",
        routeExcludePatterns: ["*.spec.ts", "*.spec.pause.ts", "**/__tests__/**"],
        idleTimeout: 15,
        defaults: {
          route: {
            expose: false,
            auth: "HttpBearer",
            rawRequest: true,
            validate: false,
            rawResponse: true
          }
        },
        cors: {
          origin: ["https://example.com"],
          credentials: true,
          allowHeaders: ["Content-Type", "Authorization"],
          allowMethods: ["GET", "POST"],
          exposeHeaders: ["Authorization"],
          maxAge: 120
        },
        openapi: {
          enabled: true,
          path: "/openapi.json",
          target: "openapi-3.0",
          auth: {
            securitySchemeNames: {
              HttpBearer: "jwtAuth"
            }
          },
          docs: {
            enabled: true,
            path: "/docs",
            exposePaths: ["/health", "/users*"]
          },
          info: {
            title: "Test API",
            version: "1.0.0",
            description: "Config loader coverage test"
          }
        },
        startup: async () => {},
        shutdown: async () => {},
        checkpoint: {
          enabled: true,
          storageDir: "./.vector/checkpoints",
          maxCheckpoints: 25,
          versionHeader: "x-vector-checkpoint-version",
          idleTimeoutMs: 300000,
          cacheKeyOverride: true
        },
        auth: async () => ({ userId: "u_1" }),
        cache: async (key, factory) => factory(),
        before: [async (request) => request],
        after: [async (response) => response]
      };
    `
    );

    const loader = new ConfigLoader(tempPath);
    const config = await loader.load();

    expect(config.port).toBe(4321);
    expect(config.hostname).toBe('127.0.0.1');
    expect(config.reusePort).toBe(false);
    expect(config.development).toBe(true);
    expect(config.routesDir).toBe('./src/controllers');
    expect(config.routeExcludePatterns).toEqual(['*.spec.ts', '*.spec.pause.ts', '**/__tests__/**']);
    expect(config.idleTimeout).toBe(15);
    expect(config.defaults).toEqual({
      route: {
        expose: false,
        auth: 'HttpBearer',
        rawRequest: true,
        validate: false,
        rawResponse: true,
      },
    });

    expect(config.cors).toEqual({
      origin: ['https://example.com'],
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST'],
      exposeHeaders: ['Authorization'],
      maxAge: 120,
    });

    expect(config.openapi).toEqual({
      enabled: true,
      path: '/openapi.json',
      target: 'openapi-3.0',
      auth: {
        securitySchemeNames: {
          HttpBearer: 'jwtAuth',
        },
      },
      docs: {
        enabled: true,
        path: '/docs',
        exposePaths: ['/health', '/users*'],
      },
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'Config loader coverage test',
      },
    });

    expect(config.checkpoint).toEqual({
      enabled: true,
      storageDir: './.vector/checkpoints',
      maxCheckpoints: 25,
      versionHeader: 'x-vector-checkpoint-version',
      idleTimeoutMs: 300000,
      cacheKeyOverride: true,
    });

    expect(typeof config.startup).toBe('function');
    expect(typeof config.shutdown).toBe('function');
    expect(Array.isArray(config.before)).toBe(true);
    expect(Array.isArray(config.finally)).toBe(true);
    expect(config.before?.length).toBe(1);
    expect(config.finally?.length).toBe(1);

    const authHandler = await loader.loadAuthHandler();
    const cacheHandler = await loader.loadCacheHandler();
    expect(typeof authHandler).toBe('function');
    expect(typeof cacheHandler).toBe('function');
  });
});
