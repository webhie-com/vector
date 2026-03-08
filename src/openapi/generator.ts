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

function normalizeRoutePathForOpenAPI(path: string): { openapiPath: string; pathParamNames: string[] } {
  let wildcardCount = 0;
  const pathParamNames: string[] = [];

  const segments = path.split('/').map((segment) => {
    const greedyParamMatch = /^:([A-Za-z0-9_]+)\+$/.exec(segment);
    if (greedyParamMatch?.[1]) {
      pathParamNames.push(greedyParamMatch[1]);
      return `{${greedyParamMatch[1]}}`;
    }

    const paramMatch = /^:([A-Za-z0-9_]+)$/.exec(segment);
    if (paramMatch?.[1]) {
      pathParamNames.push(paramMatch[1]);
      return `{${paramMatch[1]}}`;
    }

    if (segment === '*') {
      wildcardCount += 1;
      const wildcardParamName = wildcardCount === 1 ? 'wildcard' : `wildcard${wildcardCount}`;
      pathParamNames.push(wildcardParamName);
      return `{${wildcardParamName}}`;
    }

    return segment;
  });

  return {
    openapiPath: segments.join('/'),
    pathParamNames,
  };
}

function toOpenAPIPath(path: string): string {
  return normalizeRoutePathForOpenAPI(path).openapiPath;
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
  return normalizeRoutePathForOpenAPI(path).pathParamNames;
}

function addMissingPathParameters(operation: Record<string, any>, routePath: string): void {
  const existingPathNames = new Set(
    (operation.parameters || []).filter((p: any) => p.in === 'path').map((p: any) => String(p.name))
  );

  for (const pathName of extractPathParamNames(routePath)) {
    if (existingPathNames.has(pathName)) continue;

    (operation.parameters ||= []).push({
      name: pathName,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  }
}

function isNoBodyResponseStatus(status: string): boolean {
  const numericStatus = Number(status);
  if (!Number.isInteger(numericStatus)) return false;
  return (
    (numericStatus >= 100 && numericStatus < 200) ||
    numericStatus === 204 ||
    numericStatus === 205 ||
    numericStatus === 304
  );
}

function getResponseDescription(status: string): string {
  if (status === '204') return 'No Content';
  if (status === '205') return 'Reset Content';
  if (status === '304') return 'Not Modified';
  const numericStatus = Number(status);
  if (Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus < 200) {
    return 'Informational';
  }
  return 'OK';
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
      }. Falling back to a permissive JSON Schema.`
    );
    const fallback = buildFallbackJSONSchema(inputSchema);
    return isEmptyObjectSchema(fallback) ? null : fallback;
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
      }. Falling back to a permissive JSON Schema.`
    );
    return buildFallbackJSONSchema(outputSchema);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyObjectSchema(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

// Best-effort extraction of internal schema definition metadata from common
// standards-compatible validators. If unavailable, callers should fall back to {}.
function getValidatorSchemaDef(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== 'object') return null;
  const value = schema as Record<string, any>;
  if (isRecord(value._def)) return value._def as Record<string, unknown>;
  if (isRecord(value._zod) && isRecord((value._zod as Record<string, any>).def)) {
    return (value._zod as Record<string, any>).def as Record<string, unknown>;
  }
  return null;
}

function getSchemaKind(def: Record<string, unknown> | null): string | null {
  if (!def) return null;
  const typeName = def.typeName;
  if (typeof typeName === 'string') return typeName;
  const type = def.type;
  if (typeof type === 'string') return type;
  return null;
}

function pickSchemaChild(def: Record<string, unknown>): unknown {
  const candidates = ['innerType', 'schema', 'type', 'out', 'in', 'left', 'right'];
  for (const key of candidates) {
    if (key in def) return (def as Record<string, unknown>)[key];
  }
  return undefined;
}

function pickSchemaObjectCandidate(def: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = (def as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

function isOptionalWrapperKind(kind: string | null): boolean {
  if (!kind) return false;
  const lower = kind.toLowerCase();
  return lower.includes('optional') || lower.includes('default') || lower.includes('catch');
}

function unwrapOptionalForRequired(schema: unknown): { schema: unknown; optional: boolean } {
  let current = schema;
  let optional = false;
  let guard = 0;
  while (guard < 8) {
    guard += 1;
    const def = getValidatorSchemaDef(current);
    const kind = getSchemaKind(def);
    if (!def || !isOptionalWrapperKind(kind)) break;
    optional = true;
    const inner = pickSchemaChild(def);
    if (!inner) break;
    current = inner;
  }
  return { schema: current, optional };
}

function getObjectShape(def: Record<string, unknown>): Record<string, unknown> {
  const rawShape = (def as Record<string, any>).shape;
  if (typeof rawShape === 'function') {
    try {
      const resolved = rawShape();
      return isRecord(resolved) ? (resolved as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return isRecord(rawShape) ? (rawShape as Record<string, unknown>) : {};
}

function mapPrimitiveKind(kind: string): JsonSchema | null {
  const lower = kind.toLowerCase();
  if (lower.includes('string')) return { type: 'string' };
  if (lower.includes('number')) return { type: 'number' };
  if (lower.includes('boolean')) return { type: 'boolean' };
  if (lower.includes('bigint')) return { type: 'string' };
  if (lower.includes('null')) return { type: 'null' };
  if (lower.includes('any') || lower.includes('unknown') || lower.includes('never')) return {};
  if (lower.includes('date')) return { type: 'string', format: 'date-time' };
  if (lower.includes('custom')) return { type: 'object', additionalProperties: true };
  return null;
}

// Universal fallback schema builder used when converter functions throw.
// This keeps docs generation resilient and preserves routes in OpenAPI output.
function buildIntrospectedFallbackJSONSchema(schema: unknown, seen: WeakSet<object> = new WeakSet()): JsonSchema {
  if (!schema || typeof schema !== 'object') return {};
  if (seen.has(schema as object)) return {};
  seen.add(schema as object);

  const def = getValidatorSchemaDef(schema);
  const kind = getSchemaKind(def);
  if (!def || !kind) return {};

  const primitive = mapPrimitiveKind(kind);
  if (primitive) return primitive;

  const lower = kind.toLowerCase();

  if (lower.includes('object')) {
    const shape = getObjectShape(def);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, child] of Object.entries(shape)) {
      const unwrapped = unwrapOptionalForRequired(child);
      properties[key] = buildIntrospectedFallbackJSONSchema(unwrapped.schema, seen);
      if (!unwrapped.optional) required.push(key);
    }

    const out: JsonSchema = {
      type: 'object',
      properties,
      additionalProperties: true,
    };

    if (required.length > 0) {
      out.required = required;
    }

    return out;
  }

  if (lower.includes('array')) {
    const itemSchema = pickSchemaObjectCandidate(def, ['element', 'items', 'innerType', 'type']) ?? {};
    return {
      type: 'array',
      items: buildIntrospectedFallbackJSONSchema(itemSchema, seen),
    };
  }

  if (lower.includes('record')) {
    const valueType = (def as Record<string, any>).valueType ?? (def as Record<string, any>).valueSchema;
    return {
      type: 'object',
      additionalProperties: valueType ? buildIntrospectedFallbackJSONSchema(valueType, seen) : true,
    };
  }

  if (lower.includes('tuple')) {
    const items = Array.isArray((def as Record<string, any>).items)
      ? ((def as Record<string, any>).items as unknown[])
      : [];
    const prefixItems = items.map((item) => buildIntrospectedFallbackJSONSchema(item, seen));
    return {
      type: 'array',
      prefixItems,
      minItems: prefixItems.length,
      maxItems: prefixItems.length,
    };
  }

  if (lower.includes('union')) {
    const options =
      ((def as Record<string, any>).options as unknown[]) ?? ((def as Record<string, any>).schemas as unknown[]) ?? [];
    if (!Array.isArray(options) || options.length === 0) return {};
    return {
      anyOf: options.map((option) => buildIntrospectedFallbackJSONSchema(option, seen)),
    };
  }

  if (lower.includes('intersection')) {
    const left = (def as Record<string, any>).left;
    const right = (def as Record<string, any>).right;
    if (!left || !right) return {};
    return {
      allOf: [buildIntrospectedFallbackJSONSchema(left, seen), buildIntrospectedFallbackJSONSchema(right, seen)],
    };
  }

  if (lower.includes('enum')) {
    const values = (def as Record<string, any>).values;
    if (Array.isArray(values)) return { enum: values };
    if (values && typeof values === 'object') return { enum: Object.values(values as Record<string, unknown>) };
    return {};
  }

  if (lower.includes('literal')) {
    const value = (def as Record<string, any>).value;
    if (value === undefined) return {};
    const valueType = value === null ? 'null' : typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'null') {
      return { type: valueType, const: value };
    }
    return { const: value };
  }

  if (lower.includes('nullable')) {
    const inner = pickSchemaChild(def);
    if (!inner) return {};
    return {
      anyOf: [buildIntrospectedFallbackJSONSchema(inner, seen), { type: 'null' }],
    };
  }

  if (lower.includes('lazy')) {
    const getter = (def as Record<string, any>).getter;
    if (typeof getter !== 'function') return {};
    try {
      return buildIntrospectedFallbackJSONSchema(getter(), seen);
    } catch {
      return {};
    }
  }

  const child = pickSchemaChild(def);
  if (child) return buildIntrospectedFallbackJSONSchema(child, seen);

  return {};
}

function buildFallbackJSONSchema(schema: unknown): JsonSchema {
  const def = getValidatorSchemaDef(schema);
  if (!def) return {};
  return buildIntrospectedFallbackJSONSchema(schema);
}

function addStructuredInputToOperation(operation: Record<string, any>, inputJSONSchema: JsonSchema): void {
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
      const description = getResponseDescription(status);

      if (outputSchema && !isNoBodyResponseStatus(status)) {
        responses[status] = {
          description,
          content: {
            'application/json': {
              schema: outputSchema,
            },
          },
        };
      } else {
        responses[status] = {
          description,
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
      addStructuredInputToOperation(operation, inputJSONSchema);
    }
    addMissingPathParameters(operation, route.path);

    addOutputSchemasToOperation(operation, route.path, route.options.schema || {}, options.target, warnings);

    paths[openapiPath] ||= {};
    paths[openapiPath][method] = operation;
  }

  const openapiVersion = options.target === 'openapi-3.0' ? '3.0.3' : '3.1.0';

  const document = {
    openapi: openapiVersion,
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
