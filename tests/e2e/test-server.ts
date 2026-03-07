import { getVectorInstance } from '../../src/core/vector';
import type { VectorConfig } from '../../src/types';
import * as testRoutes from './test-routes';
import * as testZodRoutes from './test-zod-routes';
import testAuth from './test-auth';

interface RouteModule {
  resetState?: () => void;
  [key: string]: unknown;
}

const ROUTE_MODULES: RouteModule[] = [testRoutes as RouteModule, testZodRoutes as RouteModule];

// Simple test server setup for benchmarks and e2e tests
const testServer = {
  async serve(config: VectorConfig) {
    const vector = getVectorInstance();

    // Keep test harness deterministic across repeated server starts in the same process.
    vector.stop();
    vector.getRouter().clearRoutes();

    // Set authentication handler
    vector.setProtectedHandler(testAuth);

    // Add basic health endpoint for testing
    vector.addRoute({ method: 'GET', path: '/health' }, async () => {
      return Response.json({
        status: 'healthy',
        uptime: process.uptime(),
        requestCount: 0,
        memory: process.memoryUsage(),
      });
    });

    // Register all test route modules.
    for (const routeModule of ROUTE_MODULES) {
      if (typeof routeModule.resetState === 'function') {
        routeModule.resetState();
      }

      Object.values(routeModule).forEach((routeDef: any) => {
        if (routeDef && routeDef.options && routeDef.handler) {
          // Filter out null cache values for TypeScript compatibility
          const options = {
            ...routeDef.options,
            cache: routeDef.options.cache === null ? undefined : routeDef.options.cache,
          };
          vector.addRoute(options, routeDef.handler);
        }
      });
    }

    // Start the server with optimized settings for benchmarks
    const server = await vector.startServer({
      ...config,
      reusePort: config.reusePort ?? false,
      autoDiscover: false, // Skip route discovery for test server
    });
    return server;
  },
};

export default testServer;
