import { describe, expect, it } from 'bun:test';
import { generateOpenAPIDocument } from '../src/openapi/generator';
import type { RegisteredRouteDefinition } from '../src/core/router';

function schemaWithJson(input: Record<string, unknown>, output?: Record<string, unknown>) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: async (value: unknown) => ({ value }),
      jsonSchema: {
        input: () => input,
        output: () => output || input,
      },
    },
  };
}

describe('OpenAPI generator', () => {
  it('generates parameters/requestBody/responses from route schemas', () => {
    const inputSchema = schemaWithJson({
      type: 'object',
      required: ['body'],
      properties: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        query: {
          type: 'object',
          properties: {
            search: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    });

    const outputSchema = schemaWithJson(
      { type: 'object' },
      {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      }
    );

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/users/:id',
        options: {
          method: 'POST',
          path: '/users/:id',
          expose: true,
          schema: {
            input: inputSchema as any,
            output: { 201: outputSchema as any },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
      info: { title: 'Test API', version: '1.0.0' },
    });

    expect(result.warnings.length).toBe(0);
    const paths = result.document.paths as Record<string, any>;
    expect(paths['/users/{id}']).toBeDefined();
    expect(paths['/users/{id}'].post).toBeDefined();

    const operation = paths['/users/{id}'].post;
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path', required: true }),
        expect.objectContaining({ name: 'search', in: 'query' }),
      ])
    );
    expect(operation.requestBody).toBeDefined();
    expect(operation.responses['201']).toBeDefined();
    expect(operation.responses['201'].content['application/json'].schema).toEqual(
      expect.objectContaining({
        type: 'object',
      })
    );
  });

  it('keeps routes when schema conversion is unavailable', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/health',
        options: {
          method: 'GET',
          path: '/health',
          expose: true,
          schema: {
            input: {
              '~standard': {
                version: 1 as const,
                vendor: 'test',
                validate: async (value: unknown) => ({ value }),
              },
            } as any,
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/health']).toBeDefined();
    expect(paths['/health'].get.responses['200']).toBeDefined();
  });

  it('includes routes with no schema definition', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/public',
        options: {
          method: 'GET',
          path: '/public',
          expose: true,
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/public']).toBeDefined();
    expect(paths['/public'].get.responses['200']).toBeDefined();
  });

  it('supports schema.output shorthand without status codes', () => {
    const outputSchema = schemaWithJson(
      { type: 'object' },
      {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      }
    );

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/short-output',
        options: {
          method: 'GET',
          path: '/short-output',
          expose: true,
          schema: {
            output: outputSchema as any,
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/short-output']).toBeDefined();
    expect(paths['/short-output'].get.responses['200']).toBeDefined();
    expect(paths['/short-output'].get.responses['200'].content['application/json'].schema).toEqual(
      expect.objectContaining({ type: 'object' })
    );
    expect(paths['/short-output'].get.tags).toEqual(['short-output']);
  });

  it('adds warning when json schema conversion throws', () => {
    const throwingSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: async (value: unknown) => ({ value }),
        jsonSchema: {
          input: () => {
            throw new Error('not supported');
          },
          output: () => ({ type: 'object' }),
        },
      },
    };

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/broken',
        options: {
          method: 'POST',
          path: '/broken',
          expose: true,
          schema: { input: throwingSchema as any },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    const paths = result.document.paths as Record<string, any>;
    expect(paths['/broken']).toBeDefined();
    expect(paths['/broken'].post.tags).toEqual(['broken']);
  });

  it('uses explicit schema.tag when provided', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/admin/users',
        options: {
          method: 'GET',
          path: '/admin/users',
          expose: true,
          schema: {
            tag: 'administration',
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/admin/users'].get.tags).toEqual(['administration']);
  });

  it('omits content for no-body response statuses', () => {
    const outputSchema = schemaWithJson(
      { type: 'object' },
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
      }
    );

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'DELETE',
        path: '/users/:id',
        options: {
          method: 'DELETE',
          path: '/users/:id',
          expose: true,
          schema: {
            output: {
              200: outputSchema as any,
              204: outputSchema as any,
              205: outputSchema as any,
              304: outputSchema as any,
            },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const responses = (result.document.paths as Record<string, any>)['/users/{id}'].delete.responses;
    expect(responses['200'].content['application/json'].schema).toEqual(expect.objectContaining({ type: 'object' }));
    expect(responses['204'].description).toBe('No Content');
    expect(responses['204'].content).toBeUndefined();
    expect(responses['205'].description).toBe('Reset Content');
    expect(responses['205'].content).toBeUndefined();
    expect(responses['304'].description).toBe('Not Modified');
    expect(responses['304'].content).toBeUndefined();
  });

  it('emits openapi 3.0.3 for openapi-3.0 target and 3.1.0 for JSON Schema draft targets', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/ping',
        options: { method: 'GET', path: '/ping', expose: true },
      },
    ];

    const result30 = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    expect(result30.document.openapi).toBe('3.0.3');

    const result2020 = generateOpenAPIDocument(routes, { target: 'draft-2020-12' });
    expect(result2020.document.openapi).toBe('3.1.0');

    const result07 = generateOpenAPIDocument(routes, { target: 'draft-07' });
    expect(result07.document.openapi).toBe('3.1.0');
  });

  it('normalizes greedy and wildcard paths to OpenAPI templates', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/files/:path+',
        options: {
          method: 'GET',
          path: '/files/:path+',
          expose: true,
        },
      },
      {
        method: 'GET',
        path: '/api/*/users',
        options: {
          method: 'GET',
          path: '/api/*/users',
          expose: true,
        },
      },
      {
        method: 'GET',
        path: '/assets/*/*',
        options: {
          method: 'GET',
          path: '/assets/*/*',
          expose: true,
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/files/{path}']).toBeDefined();
    expect(paths['/api/{wildcard}/users']).toBeDefined();
    expect(paths['/assets/{wildcard}/{wildcard2}']).toBeDefined();

    expect(paths['/files/{path}'].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'path', in: 'path', required: true })])
    );
    expect(paths['/api/{wildcard}/users'].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'wildcard', in: 'path', required: true })])
    );
    expect(paths['/assets/{wildcard}/{wildcard2}'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'wildcard', in: 'path', required: true }),
        expect.objectContaining({ name: 'wildcard2', in: 'path', required: true }),
      ])
    );
  });
});
