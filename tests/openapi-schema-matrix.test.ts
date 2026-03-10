import { describe, expect, it } from 'bun:test';
import { type as arktype } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod';
import { generateOpenAPIDocument } from '../src/openapi/generator';
import type { RegisteredRouteDefinition } from '../src/core/router';

describe('OpenAPI schema matrix', () => {
  it('zod: falls back date/custom to OpenAPI-safe shapes on converter throw', () => {
    const schema = z.object({
      createdAt: z.date(),
      metadata: z.custom<unknown>(),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/matrix-zod',
        options: {
          method: 'GET',
          path: '/matrix-zod',
          expose: true,
          schema: { output: { 200: schema as any } },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const responseSchema = (result.document.paths as any)['/matrix-zod'].get.responses['200'].content[
      'application/json'
    ].schema;

    expect(responseSchema.properties.createdAt.type).toBe('string');
    expect(responseSchema.properties.createdAt.format).toBe('date-time');
    expect(responseSchema.properties.metadata.type).toBe('object');
    expect(responseSchema.properties.metadata.additionalProperties).toBe(true);
  });

  it('arktype: uses draft-07 converter fallback when openapi-3.0 target is unsupported', () => {
    const schema = arktype({
      status: '"NEW"|"ACTIVE"',
      maybe: 'string|null',
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/matrix-ark',
        options: {
          method: 'GET',
          path: '/matrix-ark',
          expose: true,
          schema: { output: { 200: schema as any } },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const responseSchema = (result.document.paths as any)['/matrix-ark'].get.responses['200'].content[
      'application/json'
    ].schema;

    expect(responseSchema.properties.status.enum).toEqual(expect.arrayContaining(['NEW', 'ACTIVE']));
    expect(responseSchema.properties.maybe.anyOf).toBeDefined();
    expect(result.warnings.some((warning) => warning.includes('using draft-07 conversion output'))).toBe(true);
    expect(result.document.openapi).toBe('3.0.3');
  });

  it('valibot: builds fallback schemas when jsonSchema converters are unavailable', () => {
    const outputSchema = v.object({
      createdAt: v.date(),
      status: v.picklist(['NEW', 'ACTIVE']),
      maybe: v.nullable(v.string()),
      metadata: v.custom(() => true),
    });
    const inputSchema = v.object({
      body: outputSchema,
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/matrix-valibot',
        options: {
          method: 'POST',
          path: '/matrix-valibot',
          expose: true,
          schema: {
            input: inputSchema as any,
            output: { 200: outputSchema as any },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const operation = (result.document.paths as any)['/matrix-valibot'].post;

    expect(operation).toBeDefined();
    expect(operation.requestBody.content['application/json'].schema.properties.createdAt.format).toBe('date-time');
    expect(operation.requestBody.content['application/json'].schema.properties.status.enum).toEqual(
      expect.arrayContaining(['NEW', 'ACTIVE'])
    );
    expect(operation.requestBody.content['application/json'].schema.properties.maybe.anyOf).toBeDefined();
    expect(operation.responses['200'].content['application/json'].schema.properties.metadata.type).toBe('object');
  });

  it('zod: preserves enum values in fallback path', () => {
    const schema = z.object({
      createdAt: z.date(),
      status: z.enum(['NEW', 'ACTIVE']),
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/matrix-zod-enum',
        options: {
          method: 'GET',
          path: '/matrix-zod-enum',
          expose: true,
          schema: { output: { 200: schema as any } },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const responseSchema = (result.document.paths as any)['/matrix-zod-enum'].get.responses['200'].content[
      'application/json'
    ].schema;

    expect(responseSchema.properties.status.type).toBe('string');
    expect(responseSchema.properties.status.enum).toEqual(expect.arrayContaining(['NEW', 'ACTIVE']));
  });

  it('arktype: keeps equivalent schema shape between openapi-3.0 fallback and draft-07 target', () => {
    const schema = arktype({
      status: '"NEW"|"ACTIVE"',
      maybe: 'string|null',
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'GET',
        path: '/matrix-ark-equivalence',
        options: {
          method: 'GET',
          path: '/matrix-ark-equivalence',
          expose: true,
          schema: { output: { 200: schema as any } },
        },
      },
    ];

    const openapiResult = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const draftResult = generateOpenAPIDocument(routes, { target: 'draft-07' });

    const openapiSchema = (openapiResult.document.paths as any)['/matrix-ark-equivalence'].get.responses['200'].content[
      'application/json'
    ].schema;
    const draftSchema = (draftResult.document.paths as any)['/matrix-ark-equivalence'].get.responses['200'].content[
      'application/json'
    ].schema;

    expect(openapiSchema.properties.status.enum).toEqual(draftSchema.properties.status.enum);
    expect(openapiSchema.properties.maybe.anyOf).toEqual(draftSchema.properties.maybe.anyOf);
  });

  it('matrix: emits operation docs and status descriptions across zod/valibot/arktype routes', () => {
    const zodSchema = z.object({
      id: z.string().describe('Zod id field'),
    });
    const valibotSchema = v.object({
      id: v.description('Valibot id field', v.string()),
    });
    const arktypeSchema = arktype({
      id: 'string',
    });

    const routes: RegisteredRouteDefinition[] = [
      {
        method: 'POST',
        path: '/matrix-docs-zod',
        options: {
          method: 'POST',
          path: '/matrix-docs-zod',
          expose: true,
          schema: {
            summary: 'Create Zod Thing',
            description: 'Creates an entity using Zod schema.',
            output: {
              201: zodSchema as any,
              404: zodSchema as any,
            },
          },
        },
      },
      {
        method: 'POST',
        path: '/matrix-docs-valibot',
        options: {
          method: 'POST',
          path: '/matrix-docs-valibot',
          expose: true,
          schema: {
            summary: 'Create Valibot Thing',
            descrition: 'Creates an entity using Valibot schema.',
            output: {
              201: valibotSchema as any,
              429: valibotSchema as any,
            },
          },
        },
      },
      {
        method: 'POST',
        path: '/matrix-docs-arktype',
        options: {
          method: 'POST',
          path: '/matrix-docs-arktype',
          expose: true,
          schema: {
            summary: 'Create ArkType Thing',
            description: 'Creates an entity using ArkType schema.',
            output: {
              202: arktypeSchema as any,
              503: arktypeSchema as any,
            },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const paths = result.document.paths as Record<string, any>;

    const zodOp = paths['/matrix-docs-zod'].post;
    expect(zodOp.summary).toBe('Create Zod Thing');
    expect(zodOp.description).toBe('Creates an entity using Zod schema.');
    expect(zodOp.responses['201'].description).toBe('Created');
    expect(zodOp.responses['404'].description).toBe('Not Found');
    expect(zodOp.responses['201'].content['application/json'].schema.properties.id.description).toBe('Zod id field');

    const valibotOp = paths['/matrix-docs-valibot'].post;
    expect(valibotOp.summary).toBe('Create Valibot Thing');
    expect(valibotOp.description).toBe('Creates an entity using Valibot schema.');
    expect(valibotOp.responses['201'].description).toBe('Created');
    expect(valibotOp.responses['429'].description).toBe('Too Many Requests');
    // Current valibot conversion path does not preserve field descriptions.
    expect(valibotOp.responses['201'].content['application/json'].schema.properties.id.description).toBeUndefined();

    const arktypeOp = paths['/matrix-docs-arktype'].post;
    expect(arktypeOp.summary).toBe('Create ArkType Thing');
    expect(arktypeOp.description).toBe('Creates an entity using ArkType schema.');
    expect(arktypeOp.responses['202'].description).toBe('Accepted');
    expect(arktypeOp.responses['503'].description).toBe('Service Unavailable');
  });
});
