import { describe, expect, it } from 'bun:test';
import { normalizeLogicalPath } from '../src/checkpoint/artifacts/manifest';

describe('checkpoint manifest path normalization', () => {
  it('normalizes Windows absolute paths without drive-letter artifacts', () => {
    const normalized = normalizeLogicalPath('C:\\tmp\\app\\config\\data.json');
    expect(normalized).toBe('tmp/app/config/data.json');
  });
});
