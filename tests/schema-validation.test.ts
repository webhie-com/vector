import { describe, expect, it } from 'bun:test';
import {
  createValidationErrorPayload,
  extractThrownIssues,
  isStandardRouteSchema,
  normalizeValidationIssues,
  runStandardValidation,
} from '../src/utils/schema-validation';

function makeSchema(validate: (value: unknown) => unknown | Promise<unknown>) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate,
    },
  };
}

describe('schema-validation utils', () => {
  it('detects valid StandardSchemaV1 objects', () => {
    const schema = makeSchema((value) => ({ value }));
    expect(isStandardRouteSchema(schema)).toBe(true);
    expect(isStandardRouteSchema({})).toBe(false);
    expect(isStandardRouteSchema({ '~standard': { version: 2, validate: () => ({}) } })).toBe(false);
  });

  it('returns success and value from runStandardValidation', async () => {
    const schema = makeSchema((value) => ({ value: { wrapped: value } }));
    const result = await runStandardValidation(schema as any, { id: '1' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual({ wrapped: { id: '1' } });
    }
  });

  it('returns failure issues from runStandardValidation', async () => {
    const schema = makeSchema(() => ({
      issues: [{ message: 'bad', path: ['body', 'email'], code: 'invalid' }],
    }));
    const result = await runStandardValidation(schema as any, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBe(1);
    }
  });

  it('extracts thrown issues from common error shapes', () => {
    const direct = extractThrownIssues([{ message: 'x' }]);
    expect(direct).toEqual([{ message: 'x' }]);

    const errorObj = extractThrownIssues({ issues: [{ message: 'y' }] });
    expect(errorObj).toEqual([{ message: 'y' }]);

    const causeObj = extractThrownIssues({ cause: { issues: [{ message: 'z' }] } });
    expect(causeObj).toEqual([{ message: 'z' }]);

    const none = extractThrownIssues(new Error('boom'));
    expect(none).toBeNull();
  });

  it('normalizes validation issues deterministically', () => {
    const issues = [
      { message: 'Invalid email', path: ['body', { key: 'email' }], code: 'invalid_string' },
      { path: [Symbol.for('s')], message: '' },
      {},
    ];

    const normalized = normalizeValidationIssues(issues, false);
    expect(normalized).toEqual([
      {
        message: 'Invalid email',
        path: ['body', 'email'],
        code: 'invalid_string',
      },
      {
        message: 'Invalid value',
        path: ['Symbol(s)'],
      },
      {
        message: 'Invalid value',
        path: [],
      },
    ]);
  });

  it('includes raw issue payload only when requested', () => {
    const issues = [{ message: 'Invalid', path: ['body'] }];
    const noRaw = normalizeValidationIssues(issues, false);
    expect((noRaw[0] as any).raw).toBeUndefined();

    const withRaw = normalizeValidationIssues(issues, true);
    expect(withRaw[0].raw).toEqual(issues[0]);
  });

  it('builds standardized validation error payload', () => {
    const payload = createValidationErrorPayload('input', [{ message: 'Invalid email', path: ['body', 'email'] }]);

    expect(payload).toMatchObject({
      error: true,
      message: 'Validation failed',
      statusCode: 422,
      source: 'validation',
      target: 'input',
      issues: [{ message: 'Invalid email', path: ['body', 'email'] }],
    });
    expect(typeof payload.timestamp).toBe('string');
  });
});
