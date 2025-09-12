import { getVectorInstance } from '../../src/core/vector';
import type { VectorConfig } from '../../src/types';
import * as testRoutes from './test-routes';
import testAuth from './test-auth';

// Simple test server setup for benchmarks and e2e tests
const testServer = {
  async serve(config: VectorConfig) {
    const vector = getVectorInstance();
    
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
    
    // Register all test routes
    Object.values(testRoutes).forEach((routeDef) => {
      if (routeDef && routeDef.options && routeDef.handler) {
        // Filter out null cache values for TypeScript compatibility
        const options = {
          ...routeDef.options,
          cache: routeDef.options.cache === null ? undefined : routeDef.options.cache
        };
        vector.addRoute(options, routeDef.handler);
      }
    });

    // Start the server with optimized settings for benchmarks
    const server = await vector.startServer({
      ...config,
      reusePort: false, // Disable reusePort for stability on Windows
      autoDiscover: false, // Skip route discovery for test server
    });
    return server;
  },
};

export default testServer;