import { beforeEach, describe, expect, it } from 'bun:test';
import { getVectorInstance } from '../src/core/vector';
import { ConfigLoader } from '../src/core/config-loader';
import type { VectorRequest, VectorConfig, BeforeMiddlewareHandler, AfterMiddlewareHandler } from '../src/types';

describe('Middleware Integration with Auto-Discovery', () => {
  beforeEach(() => {
    // Reset Vector instance
    const vector = getVectorInstance();
    vector.stop();
  });

  it('should execute before middleware for auto-discovered routes', async () => {
    let middlewareExecuted = false;
    let routeExecuted = false;

    const beforeMiddleware: BeforeMiddlewareHandler = async (request) => {
      middlewareExecuted = true;
      request.context.fromMiddleware = 'test-value';
      return request;
    };

    const config: VectorConfig = {
      port: 3001,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [beforeMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);

    // Make a request to test the middleware
    const response = await fetch('http://localhost:3001/hello');
    const data = await response.json();

    expect(middlewareExecuted).toBe(true);
    expect(response.status).toBe(200);

    server.stop();
  });

  it('should stop execution when before middleware returns Response', async () => {
    let routeExecuted = false;

    const beforeMiddleware: BeforeMiddlewareHandler = async (request) => {
      // Return early response
      return new Response('Blocked by middleware', { status: 403 });
    };

    const config: VectorConfig = {
      port: 3002,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [beforeMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);

    // Make a request - should be blocked by middleware
    const response = await fetch('http://localhost:3002/hello');
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(text).toBe('Blocked by middleware');

    server.stop();
  });

  it('should execute after/finally middleware for auto-discovered routes', async () => {
    let finallyExecuted = false;
    const customHeader = 'X-Custom-Header';

    const afterMiddleware: AfterMiddlewareHandler = async (response, request) => {
      finallyExecuted = true;
      const headers = new Headers(response.headers);
      headers.set(customHeader, 'middleware-added');
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    };

    const config: VectorConfig = {
      port: 3003,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      finally: [afterMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);

    // Make a request to test the after middleware
    const response = await fetch('http://localhost:3003/hello');

    expect(finallyExecuted).toBe(true);
    expect(response.headers.get(customHeader)).toBe('middleware-added');

    server.stop();
  });

  it('should handle errors thrown in before middleware', async () => {
    const beforeMiddleware: BeforeMiddlewareHandler = async (request) => {
      throw new Error('Middleware error');
    };

    const config: VectorConfig = {
      port: 3004,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [beforeMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);

    // Make a request - should get error response
    const response = await fetch('http://localhost:3004/hello');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe(true);
    expect(data.message).toContain('Middleware error');

    server.stop();
  });

  it('should execute multiple middleware in order', async () => {
    const executionOrder: string[] = [];

    const middleware1: BeforeMiddlewareHandler = async (request) => {
      executionOrder.push('first');
      request.context.first = true;
      return request;
    };

    const middleware2: BeforeMiddlewareHandler = async (request) => {
      executionOrder.push('second');
      request.context.second = true;
      return request;
    };

    const middleware3: BeforeMiddlewareHandler = async (request) => {
      executionOrder.push('third');
      request.context.third = true;
      return request;
    };

    const config: VectorConfig = {
      port: 3005,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [middleware1, middleware2, middleware3],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);

    // Make a request
    await fetch('http://localhost:3005/hello');

    expect(executionOrder).toEqual(['first', 'second', 'third']);

    server.stop();
  });

  it('should load middleware from config file', async () => {
    // Create a test config with middleware
    const testMiddleware: BeforeMiddlewareHandler = async (request) => {
      request.context.testMiddleware = true;
      return request;
    };

    const testAfterMiddleware: AfterMiddlewareHandler = async (response, request) => {
      const headers = new Headers(response.headers);
      headers.set('X-Test-Middleware', 'true');
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    };

    const config: VectorConfig = {
      port: 3006,
      hostname: 'localhost',
      routesDir: './tests/fixtures/routes',
      autoDiscover: true,
      before: [testMiddleware],
      finally: [testAfterMiddleware],
    };

    const vector = getVectorInstance();
    const server = await vector.startServer(config);

    const response = await fetch('http://localhost:3006/hello');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Test-Middleware')).toBe('true');
    expect(data.message).toBeDefined();

    server.stop();
  });
});