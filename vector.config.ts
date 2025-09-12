import type { VectorConfigSchema } from './src/types';

// Vector Framework Configuration
// This file replaces all programmatic API calls
const config: VectorConfigSchema = {
  // Server configuration
  server: {
    port: 3000,
    hostname: 'localhost',
    reusePort: true,
    development: process.env.NODE_ENV !== 'production',
  },

  // Routes configuration
  routes: {
    dir: './routes',
    autoDiscover: true,
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

  // Optional: Custom TypeScript types
  // types: {
  //   auth: MyCustomAuthUser,
  //   context: MyCustomContext,
  // }
};

export default config;