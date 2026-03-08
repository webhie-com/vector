import { describe, expect, it, beforeAll } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const PACKAGE_ROOT = join(import.meta.dir, '..', '..');

describe('Package exports', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vector-exports-'));
  });

  /**
   * Verify every path declared in package.json exports actually exists in dist/.
   */
  it('all exported paths resolve to existing files', async () => {
    const pkg = await Bun.file(join(PACKAGE_ROOT, 'package.json')).json();
    const missing: string[] = [];

    for (const [entrypoint, conditions] of Object.entries(pkg.exports)) {
      for (const [condition, filePath] of Object.entries(
        conditions as Record<string, string>
      )) {
        const abs = join(PACKAGE_ROOT, filePath);
        const exists = await Bun.file(abs).exists();
        if (!exists) {
          missing.push(`${entrypoint} [${condition}] → ${filePath}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  /**
   * Verify CJS entry points use .cjs extension (unambiguous CommonJS
   * regardless of "type": "module").
   */
  it('require conditions use .cjs extension', async () => {
    const pkg = await Bun.file(join(PACKAGE_ROOT, 'package.json')).json();
    const violations: string[] = [];

    for (const [entrypoint, conditions] of Object.entries(pkg.exports)) {
      const conds = conditions as Record<string, string>;
      if (conds.require && !conds.require.endsWith('.cjs')) {
        violations.push(
          `${entrypoint} require → ${conds.require} (expected .cjs)`
        );
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * Verify import conditions use .mjs or .js extension (both valid ESM
   * under "type": "module").
   */
  it('import conditions use ESM-compatible extension', async () => {
    const pkg = await Bun.file(join(PACKAGE_ROOT, 'package.json')).json();
    const violations: string[] = [];

    for (const [entrypoint, conditions] of Object.entries(pkg.exports)) {
      const conds = conditions as Record<string, string>;
      if (
        conds.import &&
        !conds.import.endsWith('.mjs') &&
        !conds.import.endsWith('.js')
      ) {
        violations.push(
          `${entrypoint} import → ${conds.import} (expected .mjs or .js)`
        );
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * Verify .cjs files contain actual CJS syntax, not ESM.
   */
  it('.cjs files contain CJS module syntax', async () => {
    const pkg = await Bun.file(join(PACKAGE_ROOT, 'package.json')).json();
    const failures: string[] = [];

    for (const [entrypoint, conditions] of Object.entries(pkg.exports)) {
      const conds = conditions as Record<string, string>;
      if (!conds.require) continue;

      const abs = join(PACKAGE_ROOT, conds.require);
      const content = await Bun.file(abs).text();

      // Bun CJS bundles start with @bun-cjs marker or use module.exports
      const isCJS =
        content.includes('@bun-cjs') ||
        content.includes('module.exports') ||
        content.includes('exports.');

      if (!isCJS) {
        failures.push(
          `${entrypoint} require → ${conds.require} does not contain CJS syntax`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  /**
   * Verify ESM entry points don't contain CJS syntax (module.exports wrapper).
   */
  it('ESM entry points contain ESM syntax', async () => {
    const pkg = await Bun.file(join(PACKAGE_ROOT, 'package.json')).json();
    const failures: string[] = [];

    for (const [entrypoint, conditions] of Object.entries(pkg.exports)) {
      const conds = conditions as Record<string, string>;
      const esmPath = conds.import || conds.default;
      if (!esmPath) continue;

      const abs = join(PACKAGE_ROOT, esmPath);
      const content = await Bun.file(abs).text();

      if (content.includes('@bun-cjs')) {
        failures.push(
          `${entrypoint} ESM entry → ${esmPath} contains CJS wrapper`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  /**
   * Simulate a consumer importing the package via Bun's resolver to verify
   * the exports map works end-to-end.
   */
  it('Bun can resolve and import the main entry', async () => {
    const consumerDir = join(tempDir, 'test-import-main');
    await mkdir(consumerDir, { recursive: true });

    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'test-consumer',
        dependencies: { 'vector-framework': `file:${PACKAGE_ROOT}` },
      })
    );

    const install = Bun.spawnSync(['bun', 'install'], { cwd: consumerDir });
    expect(install.exitCode).toBe(0);

    await writeFile(
      join(consumerDir, 'test.ts'),
      `import { route, createResponse, APIError } from 'vector-framework';
if (!route || !createResponse || !APIError) {
  process.exit(1);
}
console.log('OK');`
    );

    const result = Bun.spawnSync(['bun', 'run', 'test.ts'], {
      cwd: consumerDir,
    });
    expect(result.stdout.toString().trim()).toBe('OK');
    expect(result.exitCode).toBe(0);
  });

  it('Bun can resolve and import the errors sub-entry', async () => {
    const consumerDir = join(tempDir, 'test-import-errors');
    await mkdir(consumerDir, { recursive: true });

    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'test-consumer',
        dependencies: { 'vector-framework': `file:${PACKAGE_ROOT}` },
      })
    );

    const install = Bun.spawnSync(['bun', 'install'], { cwd: consumerDir });
    expect(install.exitCode).toBe(0);

    await writeFile(
      join(consumerDir, 'test.ts'),
      `import { VectorError, isVectorError } from 'vector-framework/errors';
if (!VectorError || !isVectorError) {
  process.exit(1);
}
console.log('OK');`
    );

    const result = Bun.spawnSync(['bun', 'run', 'test.ts'], {
      cwd: consumerDir,
    });
    expect(result.stdout.toString().trim()).toBe('OK');
    expect(result.exitCode).toBe(0);
  });

  it('Bun can resolve and import the types sub-entry', async () => {
    const consumerDir = join(tempDir, 'test-import-types');
    await mkdir(consumerDir, { recursive: true });

    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'test-consumer',
        dependencies: { 'vector-framework': `file:${PACKAGE_ROOT}` },
      })
    );

    const install = Bun.spawnSync(['bun', 'install'], { cwd: consumerDir });
    expect(install.exitCode).toBe(0);

    // Type-only import — just verify it resolves without error
    await writeFile(
      join(consumerDir, 'test.ts'),
      `import type { VectorRequest } from 'vector-framework/types';
const x: VectorRequest = {} as any;
console.log('OK');`
    );

    const result = Bun.spawnSync(['bun', 'run', 'test.ts'], {
      cwd: consumerDir,
    });
    expect(result.stdout.toString().trim()).toBe('OK');
    expect(result.exitCode).toBe(0);
  });
});
