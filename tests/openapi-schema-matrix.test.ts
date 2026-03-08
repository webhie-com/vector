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
});
