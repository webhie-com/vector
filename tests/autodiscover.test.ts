import { expect, test, describe } from 'bun:test';
import vector from '../src';

describe('AutoDiscover', () => {
  test('should handle missing routes directory gracefully', async () => {
    // Should not throw when routes directory doesn't exist
    // This tests that the fs imports are working correctly
    const server = await vector.serve({
      port: 0, // Use random port
      autoDiscover: true,
      routesDir: './nonexistent-routes-' + Date.now() // Unique path to avoid conflicts
    });
    
    expect(server).toBeDefined();
    expect(server.port).toBeGreaterThan(0);
    server.stop();
  });

  test('should work with autoDiscover disabled', async () => {
    const server = await vector.serve({
      port: 0,
      autoDiscover: false
    });
    
    expect(server).toBeDefined();
    expect(server.port).toBeGreaterThan(0);
    server.stop();
  });

  test('should handle routes correctly', async () => {
    // Add a test route
    vector.route(
      {
        method: 'GET',
        path: '/test-route-' + Date.now(), // Unique path to avoid conflicts
      },
      async () => {
        return { success: true };
      }
    );
    
    const server = await vector.serve({
      port: 0,
      autoDiscover: false
    });
    
    expect(server).toBeDefined();
    server.stop();
  });
});