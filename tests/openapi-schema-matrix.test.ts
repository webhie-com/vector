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

  it('arktype: falls back to {} on jsonSchema conversion failures', () => {
    const schema = arktype({
      createdAt: 'Date',
      metadata: 'unknown',
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

    expect(responseSchema).toEqual({});
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('valibot: keeps route docs even when jsonSchema converters are unavailable', () => {
    const schema = v.object({
      createdAt: v.date(),
      metadata: v.custom(() => true),
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
            input: schema as any,
            output: { 200: schema as any },
          },
        },
      },
    ];

    const result = generateOpenAPIDocument(routes, { target: 'openapi-3.0' });
    const operation = (result.document.paths as any)['/matrix-valibot'].post;

    expect(operation).toBeDefined();
    expect(operation.responses['200']).toEqual({ description: 'OK' });
  });
});
