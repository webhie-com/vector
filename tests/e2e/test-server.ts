import { getVectorInstance } from '../../src/core/vector';
import type { VectorConfig } from '../../src/types';

// Simple test server setup for benchmarks and e2e tests
const testServer = {
  async serve(config: VectorConfig) {
    const vector = getVectorInstance();
    
    // Add basic health endpoint for testing
    vector.addRoute({ method: 'GET', path: '/health' }, async () => {
      return Response.json({
        status: 'healthy',
        uptime: process.uptime(),
        requestCount: 0,
        memory: process.memoryUsage(),
      });
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