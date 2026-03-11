import { describe, expect, it } from 'bun:test';
import { generateOpenAPIDocument } from '../src/openapi/generator';
import type { RegisteredRouteDefinition } from '../src/core/router';
import { AuthKind, OpenApiSecuritySchemeType } from '../src/types';
import { z } from 'zod';

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

  it('sets operation.deprecated when the route is marked deprecated', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/legacy-endpoint',
        options: {
          method: 'GET',
          path: '/legacy-endpoint',
          expose: true,
          deprecated: true,
        },
      },
      {
        method: 'GET',
        path: '/active-endpoint',
        options: {
          method: 'GET',
          path: '/active-endpoint',
          expose: true,
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/legacy-endpoint'].get.deprecated).toBe(true);
    expect(paths['/active-endpoint'].get.deprecated).toBeUndefined();
  });

  it('emits operation summary and description from route schema docs', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/with-docs',
        options: {
          method: 'GET',
          path: '/with-docs',
          expose: true,
          schema: {
            summary: 'Get docs route',
            description: 'Returns the route used to verify OpenAPI operation docs text.',
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/with-docs'].get.summary).toBe('Get docs route');
    expect(paths['/with-docs'].get.description).toBe('Returns the route used to verify OpenAPI operation docs text.');
  });

  it('supports schema.descrition alias for operation description', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/with-descrition',
        options: {
          method: 'GET',
          path: '/with-descrition',
          expose: true,
          schema: {
            descrition: 'Alias spelling should still populate operation description.',
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/with-descrition'].get.description).toBe(
      'Alias spelling should still populate operation description.'
    );
  });

  it('falls back operation docs from input schema title/description', () => {
    const inputSchema = schemaWithJson({
      type: 'object',
      title: 'Create Widget',
      description: 'Creates a widget from the request payload.',
      properties: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/widgets',
        options: {
          method: 'POST',
          path: '/widgets',
          expose: true,
          schema: {
            input: inputSchema as any,
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/widgets'].post.summary).toBe('Create Widget');
    expect(paths['/widgets'].post.description).toBe('Creates a widget from the request payload.');
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

  it('falls back z.date() fields to string date-time when converter throws', () => {
    const outputSchema = z.object({
      createdAt: z.date(),
      id: z.string(),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/with-date',
        options: {
          method: 'GET',
          path: '/with-date',
          expose: true,
          schema: {
            output: {
              200: outputSchema as any,
            },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const responseSchema = paths['/with-date'].get.responses['200'].content['application/json'].schema;
    expect(responseSchema.properties.createdAt.type).toBe('string');
    expect(responseSchema.properties.createdAt.format).toBe('date-time');
  });

  it('falls back z.custom() fields to permissive object when converter throws', () => {
    const outputSchema = z.object({
      metadata: z.custom<unknown>(),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/with-custom',
        options: {
          method: 'GET',
          path: '/with-custom',
          expose: true,
          schema: {
            output: {
              200: outputSchema as any,
            },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const responseSchema = paths['/with-custom'].get.responses['200'].content['application/json'].schema;
    expect(responseSchema.properties.metadata.type).toBe('object');
    expect(responseSchema.properties.metadata.additionalProperties).toBe(true);
  });

  it('falls back to {} for unknown non-zod converter failures', () => {
    const unknownSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'custom-lib',
        validate: async (value: unknown) => ({ value }),
        jsonSchema: {
          input: () => {
            throw new Error('unsupported type in custom lib');
          },
          output: () => {
            throw new Error('unsupported type in custom lib');
          },
        },
      },
    };

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/unknown-fallback',
        options: {
          method: 'POST',
          path: '/unknown-fallback',
          expose: true,
          schema: {
            input: unknownSchema as any,
            output: {
              200: unknownSchema as any,
            },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    expect(paths['/unknown-fallback'].post.requestBody).toBeUndefined();
    expect(paths['/unknown-fallback'].post.responses['200'].content['application/json'].schema).toEqual({});
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('maps nested date/custom fields inside arrays and objects during fallback', () => {
    const outputSchema = z.object({
      events: z.array(
        z.object({
          at: z.date(),
          payload: z.custom<unknown>(),
        })
      ),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/nested-fallback',
        options: {
          method: 'GET',
          path: '/nested-fallback',
          expose: true,
          schema: {
            output: { 200: outputSchema as any },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const schema = paths['/nested-fallback'].get.responses['200'].content['application/json'].schema;
    const eventItem = schema.properties.events.items;
    expect(eventItem.properties.at.type).toBe('string');
    expect(eventItem.properties.at.format).toBe('date-time');
    expect(eventItem.properties.payload.type).toBe('object');
    expect(eventItem.properties.payload.additionalProperties).toBe(true);
  });

  it('preserves required vs optional fields in fallback object schemas', () => {
    const outputSchema = z.object({
      id: z.string(),
      createdAt: z.date(),
      note: z.string().optional(),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/required-optional',
        options: {
          method: 'GET',
          path: '/required-optional',
          expose: true,
          schema: {
            output: { 200: outputSchema as any },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const schema = paths['/required-optional'].get.responses['200'].content['application/json'].schema;
    expect(schema.required).toEqual(expect.arrayContaining(['id', 'createdAt']));
    expect(schema.required).not.toContain('note');
  });

  it('falls back for input schema and still emits requestBody', () => {
    const inputSchema = z.object({
      body: z.object({
        createdAt: z.date(),
        metadata: z.custom<unknown>().optional(),
      }),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/input-fallback',
        options: {
          method: 'POST',
          path: '/input-fallback',
          expose: true,
          schema: {
            input: inputSchema as any,
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const reqSchema = paths['/input-fallback'].post.requestBody.content['application/json'].schema;
    expect(reqSchema.properties.createdAt.type).toBe('string');
    expect(reqSchema.properties.createdAt.format).toBe('date-time');
    expect(reqSchema.properties.metadata.type).toBe('object');
    expect(reqSchema.properties.metadata.additionalProperties).toBe(true);
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

  it('uses status-specific response descriptions for non-200 statuses', () => {
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
        method: 'POST',
        path: '/response-descriptions',
        options: {
          method: 'POST',
          path: '/response-descriptions',
          expose: true,
          schema: {
            output: {
              201: outputSchema as any,
              404: outputSchema as any,
              503: outputSchema as any,
            },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const responses = paths['/response-descriptions'].post.responses;
    expect(responses['201'].description).toBe('Created');
    expect(responses['404'].description).toBe('Not Found');
    expect(responses['503'].description).toBe('Service Unavailable');
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

  it('emits security schemes and operation security from route auth settings', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/bearer-default',
        options: {
          method: 'GET',
          path: '/bearer-default',
          expose: true,
          auth: true,
        },
      },
      {
        method: 'GET',
        path: '/api-key-auth',
        options: {
          method: 'GET',
          path: '/api-key-auth',
          expose: true,
          auth: AuthKind.ApiKey,
        },
      },
      {
        method: 'GET',
        path: '/public',
        options: {
          method: 'GET',
          path: '/public',
          expose: true,
          auth: false,
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
    });

    const paths = result.document.paths as Record<string, any>;
    const components = result.document.components as Record<string, any>;

    expect(paths['/bearer-default'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/api-key-auth'].get.security).toEqual([{ apiKeyAuth: [] }]);
    expect(paths['/public'].get.security).toBeUndefined();

    expect(components.securitySchemes.bearerAuth).toEqual(
      expect.objectContaining({
        type: OpenApiSecuritySchemeType.Http,
        scheme: 'bearer',
        bearerFormat: 'JWT',
      })
    );
    expect(components.securitySchemes.apiKeyAuth).toEqual(
      expect.objectContaining({
        type: OpenApiSecuritySchemeType.ApiKey,
        name: 'X-API-Key',
        in: 'header',
      })
    );
  });

  it('supports custom security scheme names and overrides', () => {
    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/jwt-auth',
        options: {
          method: 'GET',
          path: '/jwt-auth',
          expose: true,
          auth: AuthKind.HttpBearer,
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, {
      target: 'openapi-3.0',
      auth: {
        securitySchemeNames: {
          [AuthKind.HttpBearer]: 'jwtAuth',
        },
        securitySchemes: {
          [AuthKind.HttpBearer]: {
            type: OpenApiSecuritySchemeType.Http,
            scheme: 'bearer',
            bearerFormat: 'AccessToken',
            description: 'Custom bearer auth',
          },
        },
      },
    });

    const paths = result.document.paths as Record<string, any>;
    const components = result.document.components as Record<string, any>;

    expect(paths['/jwt-auth'].get.security).toEqual([{ jwtAuth: [] }]);
    expect(components.securitySchemes.jwtAuth).toEqual(
      expect.objectContaining({
        type: OpenApiSecuritySchemeType.Http,
        scheme: 'bearer',
        bearerFormat: 'AccessToken',
        description: 'Custom bearer auth',
      })
    );
  });
});
