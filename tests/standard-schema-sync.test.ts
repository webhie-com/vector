import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('standard schema vendor sync', () => {
  it('keeps src/types/standard-schema.ts identical to vendor/standard-schema/spec.ts', () => {
    const projectRoot = resolve(import.meta.dir, '..');
    const srcSpecPath = resolve(projectRoot, 'src/types/standard-schema.ts');
    const vendorSpecPath = resolve(projectRoot, 'vendor/standard-schema/spec.ts');

    const srcSpec = readNormalized(srcSpecPath);
    const vendorSpec = readNormalized(vendorSpecPath);

    expect(srcSpec).toBe(vendorSpec);
  });
});
