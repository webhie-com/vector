import type { RegisteredRouteDefinition } from '../core/router';
import { AuthKind, HttpAuthScheme, OpenApiSecuritySchemeType } from '../types';
import type {
  OpenAPIAuthOptions,
  OpenAPIInfoOptions,
  OpenAPISecurityScheme,
  RouteSchemaDefinition,
  StandardJSONSchemaCapable,
} from '../types';

type JsonSchema = Record<string, unknown>;

export interface OpenAPIGenerationOptions {
  target: string;
  info?: OpenAPIInfoOptions;
  auth?: OpenAPIAuthOptions;
}

export interface OpenAPIGenerationResult {
  document: Record<string, unknown>;
  warnings: string[];
}

const AUTH_KIND_VALUES = new Set<string>(Object.values(AuthKind));
const DEFAULT_SECURITY_SCHEME_NAMES: Record<AuthKind, string> = {
  [AuthKind.ApiKey]: 'apiKeyAuth',
  [AuthKind.HttpBasic]: 'basicAuth',
  [AuthKind.HttpBearer]: 'bearerAuth',
  [AuthKind.HttpDigest]: 'digestAuth',
  [AuthKind.OAuth2]: 'oauth2Auth',
  [AuthKind.OpenIdConnect]: 'openIdConnectAuth',
  [AuthKind.MutualTls]: 'mutualTlsAuth',
};

function isAuthKind(value: unknown): value is AuthKind {
  return typeof value === 'string' && AUTH_KIND_VALUES.has(value);
}

function resolveRouteAuthKind(routeAuth: unknown, defaultAuthKind: AuthKind): AuthKind | null {
  if (routeAuth === undefined || routeAuth === false || routeAuth === null) {
    return null;
  }

  if (routeAuth === true) {
    return defaultAuthKind;
  }

  if (isAuthKind(routeAuth)) {
    return routeAuth;
  }

  // Preserve runtime behavior for unexpected truthy auth values.
  return defaultAuthKind;
}

function resolveSecuritySchemeName(kind: AuthKind, authOptions?: OpenAPIAuthOptions): string {
  const configuredName = authOptions?.securitySchemeNames?.[kind];
  if (typeof configuredName === 'string' && configuredName.trim().length > 0) {
    return configuredName.trim();
  }
  return DEFAULT_SECURITY_SCHEME_NAMES[kind];
}

function toOpenApiSecurityScheme(kind: AuthKind): OpenAPISecurityScheme {
  switch (kind) {
    case AuthKind.ApiKey:
      return {
        type: OpenApiSecuritySchemeType.ApiKey,
        name: 'X-API-Key',
        in: 'header',
      };
    case AuthKind.HttpBasic:
      return {
        type: OpenApiSecuritySchemeType.Http,
        scheme: HttpAuthScheme.Basic,
      };
    case AuthKind.HttpBearer:
      return {
        type: OpenApiSecuritySchemeType.Http,
        scheme: HttpAuthScheme.Bearer,
        bearerFormat: 'JWT',
      };
    case AuthKind.HttpDigest:
      return {
        type: OpenApiSecuritySchemeType.Http,
        scheme: HttpAuthScheme.Digest,
      };
    case AuthKind.OAuth2:
      return {
        type: OpenApiSecuritySchemeType.OAuth2,
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://example.com/oauth/authorize',
            tokenUrl: 'https://example.com/oauth/token',
            scopes: {},
          },
        },
      };
    case AuthKind.OpenIdConnect:
      return {
        type: OpenApiSecuritySchemeType.OpenIdConnect,
        openIdConnectUrl: 'https://example.com/.well-known/openid-configuration',
      };
    case AuthKind.MutualTls:
      return {
        type: OpenApiSecuritySchemeType.MutualTls,
      };
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

function resolveSecurityScheme(kind: AuthKind, authOptions?: OpenAPIAuthOptions): OpenAPISecurityScheme {
  const defaultScheme = toOpenApiSecurityScheme(kind);
  const override = authOptions?.securitySchemes?.[kind];
  if (!override) {
    return defaultScheme;
  }

  const merged: OpenAPISecurityScheme = {
    ...defaultScheme,
    ...override,
  };

  if (isRecord(defaultScheme.flows) && isRecord(override.flows)) {
    merged.flows = {
      ...defaultScheme.flows,
      ...override.flows,
    };
  }

  return merged;
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
  const knownDescriptions: Record<string, string> = {
    '100': 'Continue',
    '101': 'Switching Protocols',
    '102': 'Processing',
    '103': 'Early Hints',
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '207': 'Multi-Status',
    '208': 'Already Reported',
    '226': 'IM Used',
    '300': 'Multiple Choices',
    '301': 'Moved Permanently',
    '302': 'Found',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '307': 'Temporary Redirect',
    '308': 'Permanent Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Timeout',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Failed',
    '413': 'Payload Too Large',
    '414': 'URI Too Long',
    '415': 'Unsupported Media Type',
    '416': 'Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': "I'm a teapot",
    '421': 'Misdirected Request',
    '422': 'Unprocessable Content',
    '423': 'Locked',
    '424': 'Failed Dependency',
    '425': 'Too Early',
    '426': 'Upgrade Required',
    '428': 'Precondition Required',
    '429': 'Too Many Requests',
    '431': 'Request Header Fields Too Large',
    '451': 'Unavailable For Legal Reasons',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '505': 'HTTP Version Not Supported',
    '506': 'Variant Also Negotiates',
    '507': 'Insufficient Storage',
    '508': 'Loop Detected',
    '510': 'Not Extended',
    '511': 'Network Authentication Required',
  };
  if (knownDescriptions[status]) {
    return knownDescriptions[status];
  }

  const numericStatus = Number(status);
  if (Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus < 200) {
    return 'Informational Response';
  }
  if (Number.isInteger(numericStatus) && numericStatus >= 200 && numericStatus < 300) {
    return 'Successful Response';
  }
  if (Number.isInteger(numericStatus) && numericStatus >= 300 && numericStatus < 400) {
    return 'Redirection';
  }
  if (Number.isInteger(numericStatus) && numericStatus >= 400 && numericStatus < 500) {
    return 'Client Error';
  }
  if (Number.isInteger(numericStatus) && numericStatus >= 500 && numericStatus < 600) {
    return 'Server Error';
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
    const fallback = buildFallbackJSONSchema(inputSchema);
    return isEmptyObjectSchema(fallback) ? null : fallback;
  }

  try {
    return inputSchema['~standard'].jsonSchema.input({ target });
  } catch (error) {
    const alternate = tryAlternateTargetConversion(inputSchema, 'input', target, error, routePath, undefined, warnings);
    if (alternate) {
      return alternate;
    }

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
    const fallback = buildFallbackJSONSchema(outputSchema);
    return isEmptyObjectSchema(fallback) ? null : fallback;
  }

  try {
    return outputSchema['~standard'].jsonSchema.output({ target });
  } catch (error) {
    const alternate = tryAlternateTargetConversion(
      outputSchema,
      'output',
      target,
      error,
      routePath,
      statusCode,
      warnings
    );
    if (alternate) {
      return alternate;
    }

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

function tryAlternateTargetConversion(
  schema: unknown,
  kind: 'input' | 'output',
  target: string,
  originalError: unknown,
  routePath: string,
  statusCode: string | undefined,
  warnings: string[]
): JsonSchema | null {
  if (!isJSONSchemaCapable(schema)) {
    return null;
  }

  const message = originalError instanceof Error ? originalError.message : String(originalError);
  const unsupportedOpenAPITarget =
    target === 'openapi-3.0' &&
    message.includes("target 'openapi-3.0' is not supported") &&
    message.includes('draft-2020-12') &&
    message.includes('draft-07');

  if (!unsupportedOpenAPITarget) {
    return null;
  }

  try {
    const converted = schema['~standard'].jsonSchema[kind]({ target: 'draft-07' });
    warnings.push(
      kind === 'input'
        ? `[OpenAPI] ${routePath} converter does not support openapi-3.0 target; using draft-07 conversion output.`
        : `[OpenAPI] ${routePath} (${statusCode}) converter does not support openapi-3.0 target; using draft-07 conversion output.`
    );
    return converted;
  } catch {
    return null;
  }
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
  if (value.kind === 'schema' && typeof value.type === 'string') {
    return value as Record<string, unknown>;
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
  const candidates = ['innerType', 'schema', 'type', 'out', 'in', 'left', 'right', 'wrapped', 'element'];
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
  const entries = (def as Record<string, any>).entries;
  if (isRecord(entries)) {
    return entries as Record<string, unknown>;
  }

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

function extractEnumValues(def: Record<string, unknown>): unknown[] {
  const values = (def as Record<string, any>).values;
  if (Array.isArray(values)) return values;
  if (values && typeof values === 'object') return Object.values(values as Record<string, unknown>);

  const entries = (def as Record<string, any>).entries;
  if (entries && typeof entries === 'object') return Object.values(entries as Record<string, unknown>);

  const enumObject = (def as Record<string, any>).enum;
  if (enumObject && typeof enumObject === 'object') return Object.values(enumObject as Record<string, unknown>);

  const options = (def as Record<string, any>).options;
  if (Array.isArray(options)) {
    return options
      .map((item) => {
        if (item && typeof item === 'object' && 'unit' in (item as Record<string, unknown>)) {
          return (item as Record<string, unknown>).unit;
        }
        return item;
      })
      .filter((item) => item !== undefined);
  }

  return [];
}

function mapPrimitiveKind(kind: string): JsonSchema | null {
  const lower = kind.toLowerCase();
  if (lower.includes('string')) return { type: 'string' };
  if (lower.includes('number')) return { type: 'number' };
  if (lower.includes('boolean')) return { type: 'boolean' };
  if (lower.includes('bigint')) return { type: 'string' };
  if (lower === 'null' || lower.includes('zodnull')) return { type: 'null' };
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
    const enumValues = extractEnumValues(def);
    if (enumValues.length > 0) {
      const allString = enumValues.every((v) => typeof v === 'string');
      const allNumber = enumValues.every((v) => typeof v === 'number');
      const allBoolean = enumValues.every((v) => typeof v === 'boolean');
      if (allString) return { type: 'string', enum: enumValues };
      if (allNumber) return { type: 'number', enum: enumValues };
      if (allBoolean) return { type: 'boolean', enum: enumValues };
      return { enum: enumValues };
    }
    return {};
  }

  if (lower.includes('picklist')) {
    const enumValues = extractEnumValues(def);
    if (enumValues.length > 0) {
      const allString = enumValues.every((v) => typeof v === 'string');
      if (allString) return { type: 'string', enum: enumValues };
      return { enum: enumValues };
    }
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
  const defaultAuthKind = AuthKind.HttpBearer;
  const usedAuthKinds = new Set<AuthKind>();

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
    if (typeof route.options.schema?.summary === 'string' && route.options.schema.summary.trim()) {
      operation.summary = route.options.schema.summary.trim();
    }
    const routeSchemaDescription =
      typeof route.options.schema?.description === 'string' && route.options.schema.description.trim()
        ? route.options.schema.description.trim()
        : typeof route.options.schema?.descrition === 'string' && route.options.schema.descrition.trim()
          ? route.options.schema.descrition.trim()
          : undefined;
    if (routeSchemaDescription) {
      operation.description = routeSchemaDescription;
    }
    if (route.options.deprecated === true) {
      operation.deprecated = true;
    }
    const routeAuthKind = resolveRouteAuthKind(route.options.auth, defaultAuthKind);
    if (routeAuthKind) {
      usedAuthKinds.add(routeAuthKind);
      const securitySchemeName = resolveSecuritySchemeName(routeAuthKind, options.auth);
      operation.security = [{ [securitySchemeName]: [] }];
    }

    const inputJSONSchema = convertInputSchema(route.path, route.options.schema?.input, options.target, warnings);

    if (inputJSONSchema) {
      if (!operation.summary && typeof inputJSONSchema.title === 'string' && inputJSONSchema.title.trim()) {
        operation.summary = inputJSONSchema.title.trim();
      }
      if (
        !operation.description &&
        typeof inputJSONSchema.description === 'string' &&
        inputJSONSchema.description.trim()
      ) {
        operation.description = inputJSONSchema.description.trim();
      }
      addStructuredInputToOperation(operation, inputJSONSchema);
    }
    addMissingPathParameters(operation, route.path);

    addOutputSchemasToOperation(operation, route.path, route.options.schema || {}, options.target, warnings);
    if (!operation.summary || !operation.description) {
      const responseEntries = Object.values(operation.responses || {}) as any[];
      for (const response of responseEntries) {
        const responseSchema = response?.content?.['application/json']?.schema;
        if (!responseSchema || typeof responseSchema !== 'object') continue;
        if (!operation.summary && typeof responseSchema.title === 'string' && responseSchema.title.trim()) {
          operation.summary = responseSchema.title.trim();
        }
        if (
          !operation.description &&
          typeof responseSchema.description === 'string' &&
          responseSchema.description.trim()
        ) {
          operation.description = responseSchema.description.trim();
        }
        if (operation.summary && operation.description) break;
      }
    }

    paths[openapiPath] ||= {};
    paths[openapiPath][method] = operation;
  }

  const openapiVersion = options.target === 'openapi-3.0' ? '3.0.3' : '3.1.0';

  const document: Record<string, unknown> = {
    openapi: openapiVersion,
    info: {
      title: options.info?.title || 'Vector API',
      version: options.info?.version || '1.0.0',
      ...(options.info?.description ? { description: options.info.description } : {}),
    },
    paths,
  };
  if (usedAuthKinds.size > 0) {
    const securitySchemes: Record<string, OpenAPISecurityScheme> = {};
    for (const authKind of usedAuthKinds) {
      const name = resolveSecuritySchemeName(authKind, options.auth);
      securitySchemes[name] = resolveSecurityScheme(authKind, options.auth);
    }
    document.components = {
      securitySchemes,
    };
  }

  return {
    document,
    warnings,
  };
}
