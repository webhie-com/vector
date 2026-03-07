import type { StandardRouteSchema } from '../types';

export interface NormalizedValidationIssue {
  message: string;
  path: Array<string | number>;
  code?: string;
  raw?: unknown;
}

interface StandardValidationSuccess {
  success: true;
  value: unknown;
}

interface StandardValidationFailure {
  success: false;
  issues: readonly unknown[];
}

export type StandardValidationResult = StandardValidationSuccess | StandardValidationFailure;

export function isStandardRouteSchema(schema: unknown): schema is StandardRouteSchema {
  const standard = (schema as any)?.['~standard'];
  return (
    !!standard && typeof standard === 'object' && typeof standard.validate === 'function' && standard.version === 1
  );
}

export async function runStandardValidation(
  schema: StandardRouteSchema,
  value: unknown
): Promise<StandardValidationResult> {
  const result = await schema['~standard'].validate(value);
  const issues = (result as any)?.issues;

  if (Array.isArray(issues) && issues.length > 0) {
    return { success: false, issues };
  }

  return { success: true, value: (result as any)?.value };
}

export function extractThrownIssues(error: unknown): readonly unknown[] | null {
  if (Array.isArray(error)) {
    return error;
  }

  if (error && typeof error === 'object' && Array.isArray((error as any).issues)) {
    return (error as any).issues;
  }

  if (error && typeof error === 'object' && (error as any).cause && Array.isArray((error as any).cause.issues)) {
    return (error as any).cause.issues;
  }

  return null;
}

function normalizePath(path: unknown): Array<string | number> {
  if (!Array.isArray(path)) return [];

  const normalized: Array<string | number> = [];

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    let value = segment;

    if (segment && typeof segment === 'object' && 'key' in (segment as any)) {
      value = (segment as any).key;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      normalized.push(value);
    } else if (typeof value === 'symbol') {
      normalized.push(String(value));
    } else if (value !== undefined && value !== null) {
      normalized.push(String(value));
    }
  }

  return normalized;
}

export function normalizeValidationIssues(
  issues: readonly unknown[],
  includeRawIssues: boolean
): NormalizedValidationIssue[] {
  const normalized: NormalizedValidationIssue[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const maybeIssue = issue as any;
    const normalizedIssue: NormalizedValidationIssue = {
      message:
        typeof maybeIssue?.message === 'string' && maybeIssue.message.length > 0 ? maybeIssue.message : 'Invalid value',
      path: normalizePath(maybeIssue?.path),
    };

    if (typeof maybeIssue?.code === 'string') {
      normalizedIssue.code = maybeIssue.code;
    }

    if (includeRawIssues) {
      normalizedIssue.raw = issue;
    }

    normalized.push(normalizedIssue);
  }

  return normalized;
}

export function createValidationErrorPayload(target: 'input' | 'output', issues: NormalizedValidationIssue[]) {
  return {
    error: true,
    message: 'Validation failed',
    statusCode: 422,
    source: 'validation',
    target,
    issues,
    timestamp: new Date().toISOString(),
  };
}
