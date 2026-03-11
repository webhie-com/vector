import type { VectorConfigSchema, VectorContext } from './src/types';

// Vector Framework Configuration
// This file replaces all programmatic API calls
const config: VectorConfigSchema = {
  // Server configuration
  port: process.env.PORT ?? 3000,
  hostname: 'localhost',
  reusePort: true,
  development: process.env.NODE_ENV !== 'production',
  routesDir: './examples/routes',
  defaults: {
    route: {
      auth: false,
      expose: true,
      rawResponse: false,
    },
  },
  // CORS configuration
  cors: {
    origin: '*',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Authorization'],
    maxAge: 86400,
  },

  // Local OpenAPI endpoints for development
  openapi: {
    enabled: true,
    path: '/openapi.json',
    target: 'openapi-3.0',
    docs: {
      enabled: true,
      path: '/docs',
    },
    info: {
      title: 'Vector Local API',
      version: '0.0.0-local',
      description: 'Local development OpenAPI document',
    },
  },

  // Checkpoint configuration
  checkpoint: {
    enabled: true,
    storageDir: './.vector/checkpoints',
    maxCheckpoints: 10,
    versionHeader: 'x-vector-checkpoint-version',
    idleTimeoutMs: 600000,
    cacheKeyOverride: true,
  },

  before: [
    (ctx: VectorContext) => {
      console.log(ctx.request.headers.get('x-vector-checkpoint-version') ?? 'latest');
    },
  ],

  // Optional: Custom TypeScript types
  // types: {
  //   auth: MyCustomAuthUser,
  //   context: MyCustomContext,
  // }
};

export default config;
