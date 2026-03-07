import type { RegisteredRouteDefinition } from '../core/router';
import type { OpenAPIInfoOptions, RouteSchemaDefinition, StandardJSONSchemaCapable } from '../types';

type JsonSchema = Record<string, unknown>;

export interface OpenAPIGenerationOptions {
  target: string;
  info?: OpenAPIInfoOptions;
}

export interface OpenAPIGenerationResult {
  document: Record<string, unknown>;
  warnings: string[];
}

function isJSONSchemaCapable(schema: unknown): schema is StandardJSONSchemaCapable {
  const standard = (schema as any)?.['~standard'];
  const converter = standard?.jsonSchema;
  return (
    !!standard &&
    typeof standard === 'object' &&
    standard.version === 1 &&
    !!converter &&
    typeof converter.input === 'function' &&
    typeof converter.output === 'function'
  );
}

function toOpenAPIPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function createOperationId(method: string, path: string): string {
  const normalized = `${method.toLowerCase()}_${path}`
    .replace(/[:{}]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `${method.toLowerCase()}_operation`;
}

function inferTagFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  for (const segment of segments) {
    if (!segment.startsWith(':') && segment !== '*') {
      return segment.toLowerCase();
    }
  }
  return 'default';
}

function extractPathParamNames(path: string): string[] {
  const names: string[] = [];
  const matches = path.matchAll(/:([A-Za-z0-9_]+)/g);
  for (const match of matches) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}

function convertInputSchema(
  routePath: string,
  inputSchema: unknown,
  target: string,
  warnings: string[]
): JsonSchema | null {
  if (!isJSONSchemaCapable(inputSchema)) {
    return null;
  }

  try {
    return inputSchema['~standard'].jsonSchema.input({ target });
  } catch (error) {
    warnings.push(
      `[OpenAPI] Failed input schema conversion for ${routePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function convertOutputSchema(
  routePath: string,
  statusCode: string,
  outputSchema: unknown,
  target: string,
  warnings: string[]
): JsonSchema | null {
  if (!isJSONSchemaCapable(outputSchema)) {
    return null;
  }

  try {
    return outputSchema['~standard'].jsonSchema.output({ target });
  } catch (error) {
    warnings.push(
      `[OpenAPI] Failed output schema conversion for ${routePath} (${statusCode}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addStructuredInputToOperation(
  operation: Record<string, any>,
  routePath: string,
  inputJSONSchema: JsonSchema
): void {
  if (!isRecord(inputJSONSchema)) return;
  if (inputJSONSchema.type !== 'object' || !isRecord(inputJSONSchema.properties)) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: inputJSONSchema,
        },
      },
    };
    return;
  }

  const rootRequired = new Set<string>(
    Array.isArray(inputJSONSchema.required) ? (inputJSONSchema.required as string[]) : []
  );
  const properties = inputJSONSchema.properties as Record<string, unknown>;
  const parameters: any[] = Array.isArray(operation.parameters) ? operation.parameters : [];

  const parameterSections: Array<{
    key: string;
    in: 'path' | 'query' | 'header' | 'cookie';
  }> = [
    { key: 'params', in: 'path' },
    { key: 'query', in: 'query' },
    { key: 'headers', in: 'header' },
    { key: 'cookies', in: 'cookie' },
  ];

  for (const section of parameterSections) {
    const sectionSchema = properties[section.key];
    if (!isRecord(sectionSchema)) continue;
    if (sectionSchema.type !== 'object' || !isRecord(sectionSchema.properties)) continue;

    const sectionRequired = new Set<string>(
      Array.isArray(sectionSchema.required) ? (sectionSchema.required as string[]) : []
    );

    for (const [name, schema] of Object.entries(sectionSchema.properties)) {
      parameters.push({
        name,
        in: section.in,
        required: section.in === 'path' ? true : sectionRequired.has(name),
        schema: isRecord(schema) ? schema : {},
      });
    }
  }

  if (parameters.length > 0) {
    const deduped = new Map<string, any>();
    for (const parameter of parameters) {
      deduped.set(`${parameter.in}:${parameter.name}`, parameter);
    }
    operation.parameters = [...deduped.values()];
  }

  const bodySchema = properties.body;
  if (bodySchema) {
    operation.requestBody = {
      required: rootRequired.has('body'),
      content: {
        'application/json': {
          schema: isRecord(bodySchema) ? bodySchema : {},
        },
      },
    };
  }

  const existingPathNames = new Set(
    (operation.parameters || []).filter((p: any) => p.in === 'path').map((p: any) => String(p.name))
  );
  for (const pathName of extractPathParamNames(routePath)) {
    if (!existingPathNames.has(pathName)) {
      (operation.parameters ||= []).push({
        name: pathName,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    }
  }
}

function addOutputSchemasToOperation(
  operation: Record<string, any>,
  routePath: string,
  routeSchema: RouteSchemaDefinition,
  target: string,
  warnings: string[]
): void {
  const output = routeSchema.output;

  if (!output) {
    operation.responses = {
      200: { description: 'OK' },
    };
    return;
  }

  const responses: Record<string, any> = {};

  // Single output schema shorthand: schema.output = SomeSchema (defaults to 200)
  if (typeof output === 'object' && output !== null && '~standard' in output) {
    const outputSchema = convertOutputSchema(routePath, '200', output, target, warnings);

    if (outputSchema) {
      responses['200'] = {
        description: 'OK',
        content: {
          'application/json': {
            schema: outputSchema,
          },
        },
      };
    } else {
      responses['200'] = { description: 'OK' };
    }
  } else {
    for (const [statusCode, schema] of Object.entries(output as Record<string, unknown>)) {
      const status = String(statusCode);
      const outputSchema = convertOutputSchema(routePath, status, schema, target, warnings);

      if (outputSchema) {
        responses[status] = {
          description: status === '204' ? 'No Content' : 'OK',
          content: {
            'application/json': {
              schema: outputSchema,
            },
          },
        };
      } else {
        responses[status] = {
          description: status === '204' ? 'No Content' : 'OK',
        };
      }
    }
  }

  if (Object.keys(responses).length === 0) {
    responses['200'] = { description: 'OK' };
  }

  operation.responses = responses;
}

export function generateOpenAPIDocument(
  routes: RegisteredRouteDefinition[],
  options: OpenAPIGenerationOptions
): OpenAPIGenerationResult {
  const warnings: string[] = [];
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    if (route.options.expose === false) continue;
    if (!route.method || !route.path) continue;

    const method = route.method.toLowerCase();
    if (method === 'options') continue;

    const openapiPath = toOpenAPIPath(route.path);
    const operation: Record<string, any> = {
      operationId: createOperationId(method, openapiPath),
      tags: [route.options.schema?.tag || inferTagFromPath(route.path)],
    };

    const inputJSONSchema = convertInputSchema(route.path, route.options.schema?.input, options.target, warnings);

    if (inputJSONSchema) {
      addStructuredInputToOperation(operation, route.path, inputJSONSchema);
    }

    addOutputSchemasToOperation(operation, route.path, route.options.schema || {}, options.target, warnings);

    paths[openapiPath] ||= {};
    paths[openapiPath][method] = operation;
  }

  const document = {
    openapi: '3.0.3',
    info: {
      title: options.info?.title || 'Vector API',
      version: options.info?.version || '1.0.0',
      ...(options.info?.description ? { description: options.info.description } : {}),
    },
    paths,
  };

  return {
    document,
    warnings,
  };
}
