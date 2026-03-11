import { beforeEach, describe, expect, it } from 'bun:test';
import { getVectorInstance } from '../src/core/vector';
import type { VectorConfig, BeforeMiddlewareHandler, AfterMiddlewareHandler } from '../src/types';

describe('Middleware Integration with Auto-Discovery', () => {
  beforeEach(() => {
    // Reset Vector instance
    const vector = getVectorInstance();
    vector.stop();
  });

  it('should execute before middleware for auto-discovered routes', async () => {
    let middlewareExecuted = false;

    const beforeMiddleware: BeforeMiddlewareHandler = async (context) => {
      middlewareExecuted = true;
      context.metadata.fromMiddleware = 'test-value';
    };

    const config: VectorConfig = {
      port: 0,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [beforeMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);
    const port = server.port;

    // Make a request to test the middleware
    const response = await fetch(`http://localhost:${port}/hello`);

    expect(middlewareExecuted).toBe(true);
    expect(response.status).toBe(200);

    server.stop();
  });

  it('should stop execution when before middleware returns Response', async () => {
    const beforeMiddleware: BeforeMiddlewareHandler = async (_request) => {
      // Return early response
      return new Response('Blocked by middleware', { status: 403 });
    };

    const config: VectorConfig = {
      port: 0,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [beforeMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);
    const port = server.port;

    // Make a request - should be blocked by middleware
    const response = await fetch(`http://localhost:${port}/hello`);
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(text).toBe('Blocked by middleware');

    server.stop();
  });

  it('should execute after/finally middleware for auto-discovered routes', async () => {
    let finallyExecuted = false;
    const customHeader = 'X-Custom-Header';

    const afterMiddleware: AfterMiddlewareHandler = async (response, _request) => {
      finallyExecuted = true;
      const headers = new Headers(response.headers);
      headers.set(customHeader, 'middleware-added');
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    };

    const config: VectorConfig = {
      port: 0,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      finally: [afterMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);
    const port = server.port;

    // Make a request to test the after middleware
    const response = await fetch(`http://localhost:${port}/hello`);

    expect(finallyExecuted).toBe(true);
    expect(response.headers.get(customHeader)).toBe('middleware-added');

    server.stop();
  });

  it('should handle errors thrown in before middleware', async () => {
    const beforeMiddleware: BeforeMiddlewareHandler = async (_request) => {
      throw new Error('Middleware error');
    };

    const config: VectorConfig = {
      port: 0,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [beforeMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);
    const port = server.port;

    // Make a request - should get error response
    const response = await fetch(`http://localhost:${port}/hello`);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe(true);
    expect(data.message).toContain('Middleware error');

    server.stop();
  });

  it('should execute multiple middleware in order', async () => {
    const executionOrder: string[] = [];

    const middleware1: BeforeMiddlewareHandler = async (context) => {
      executionOrder.push('first');
      context.metadata.first = true;
    };

    const middleware2: BeforeMiddlewareHandler = async (context) => {
      executionOrder.push('second');
      context.metadata.second = true;
    };

    const middleware3: BeforeMiddlewareHandler = async (context) => {
      executionOrder.push('third');
      context.metadata.third = true;
    };

    const config: VectorConfig = {
      port: 0,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [middleware1, middleware2, middleware3],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);
    const port = server.port;

    // Make a request
    await fetch(`http://localhost:${port}/hello`);

    expect(executionOrder).toEqual(['first', 'second', 'third']);

    server.stop();
  });

  it('should load middleware from config file', async () => {
    // Create a test config with middleware
    const testMiddleware: BeforeMiddlewareHandler = async (context) => {
      context.metadata.testMiddleware = true;
    };

    const testAfterMiddleware: AfterMiddlewareHandler = async (response, _request) => {
      const headers = new Headers(response.headers);
      headers.set('X-Test-Middleware', 'true');
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    };

    const config: VectorConfig = {
      port: 0,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [testMiddleware],
      finally: [testAfterMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);
    const port = server.port;

    const response = await fetch(`http://localhost:${port}/hello`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Test-Middleware')).toBe('true');
    expect(data.message).toBeDefined();

    server.stop();
  });
});
