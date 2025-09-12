import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Server } from 'bun';
import testServer from './test-server';
import { createClient, withRetry } from './utils/http-client';
import { Reporter } from './utils/reporter';

describe('E2E Tests', () => {
  let server: Server;
  let client: ReturnType<typeof createClient>;
  const PORT = 3001;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    // Start test server
    server = await testServer.serve({
      port: PORT,
      hostname: '0.0.0.0',
      development: false,
    });

    client = createClient(BASE_URL);

    // Wait for server to be ready
    await withRetry(
      async () => {
        const response = await client.get('/health');
        if (response.status !== 200) {
          throw new Error('Server not ready');
        }
      },
      5,
      1000
    );
  });

  afterAll(() => {
    server?.stop();
  });

  describe('Health Check', () => {
    it('should return server health status', async () => {
      const response = await client.get('/health');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('uptime');
      expect(response.data).toHaveProperty('requestCount');
      expect(response.data).toHaveProperty('memory');
    });

    it('should include response headers', async () => {
      const response = await client.get('/health');

      expect(response.headers.get('X-Response-Time')).toBeDefined();
      expect(response.headers.get('X-Request-Id')).toBeDefined();
    });
  });

  describe('Public Endpoints', () => {
    it('should list products', async () => {
      const response = await client.get('/api/products');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('products');
      expect(response.data.products).toBeArray();
      expect(response.data.products.length).toBeGreaterThan(0);
    });

    it('should get single product', async () => {
      const response = await client.get('/api/products/1');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('id', 1);
      expect(response.data).toHaveProperty('name');
      expect(response.data).toHaveProperty('price');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await client.get('/api/products/999');

      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error', true);
      expect(response.data).toHaveProperty('message', 'Product not found');
    });

    it('should cache products endpoint', async () => {
      // First request - should be slower
      const response1 = await client.get('/api/products');
      const time1 = response1.time;

      // Second request - should be faster (cached)
      const response2 = await client.get('/api/products');
      const time2 = response2.time;

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.data).toEqual(response2.data);

      // Cached response should be faster (allow some variance)
      if (time1 > 5) {
        expect(time2).toBeLessThan(time1);
      }
    });
  });

  describe('Authentication', () => {
    it('should reject requests without auth token', async () => {
      const response = await client.get('/api/user');

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error', true);
    });

    it('should reject requests with invalid token', async () => {
      const response = await client.get('/api/user', {
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error', true);
    });

    it('should accept requests with valid token', async () => {
      client.setAuthToken('test-token-123');
      const response = await client.get('/api/user');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('user');
      expect(response.data.user).toHaveProperty('id', 'user-1');
      expect(response.data.user).toHaveProperty('email', 'test@example.com');

      client.clearAuthToken();
    });
  });

  describe('Data Creation', () => {
    it('should create data with authentication', async () => {
      client.setAuthToken('test-token-123');

      const data = { name: 'Test Item', value: 123 };
      const response = await client.post('/api/data', data);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('id');
      expect(response.data.data).toHaveProperty('name', 'Test Item');

      client.clearAuthToken();
    });

    it('should validate required fields', async () => {
      client.setAuthToken('test-token-123');

      const response = await client.post('/api/data', {});

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error', true);
      expect(response.data).toHaveProperty('message', 'Name is required');

      client.clearAuthToken();
    });
  });

  describe('Error Handling', () => {
    it('should handle different error types', async () => {
      const errorTypes = [
        { type: 'bad-request', status: 400 },
        { type: 'unauthorized', status: 401 },
        { type: 'forbidden', status: 403 },
        { type: 'not-found', status: 404 },
        { type: 'conflict', status: 409 },
        { type: 'internal', status: 500 },
        { type: 'rate-limit', status: 429 },
      ];

      for (const { type, status } of errorTypes) {
        const response = await client.get(`/api/error?type=${type}`);
        expect(response.status).toBe(status);
        expect(response.data).toHaveProperty('error', true);
        expect(response.data).toHaveProperty('message');
        expect(response.data).toHaveProperty('statusCode', status);
      }
    });
  });

  describe('Performance Endpoints', () => {
    it('should handle compute-intensive requests', async () => {
      const response = await client.get('/api/compute?iterations=10000');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('iterations', 10000);
      expect(response.data).toHaveProperty('result');
      expect(response.data).toHaveProperty('computeTime');
    });

    it('should handle slow responses', async () => {
      const response = await client.get('/api/slow?delay=100', { timeout: 5000 });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('delay', 100);
      expect(response.time).toBeGreaterThanOrEqual(100);
    });

    it('should timeout on very slow responses', async () => {
      try {
        await client.get('/api/slow?delay=10000', { timeout: 1000 });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should provide server metrics', async () => {
      const response = await client.get('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('uptime');
      expect(response.data).toHaveProperty('requests');
      expect(response.data.requests).toHaveProperty('total');
      expect(response.data.requests).toHaveProperty('perSecond');
      expect(response.data).toHaveProperty('memory');
    });

    it('should reset test data', async () => {
      const response = await client.post('/api/reset');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('message', 'Test data reset');
    });
  });

  describe('Memory Management', () => {
    it('should handle memory allocation', async () => {
      const response = await client.get('/api/memory');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('allocated', '10MB');
      expect(response.data).toHaveProperty('memory');
    });
  });
});
