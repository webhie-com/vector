import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CheckpointBundler } from '../src/checkpoint/bundler';

const TEST_OUTPUT_DIR = join(process.cwd(), '.vector/test-bundler');

async function cleanup() {
  if (existsSync(TEST_OUTPUT_DIR)) {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
}

async function createTestEntrypoint(filename = 'entrypoint.ts'): Promise<string> {
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  const entrypointPath = join(TEST_OUTPUT_DIR, filename);
  await fs.writeFile(
    entrypointPath,
    `
const server = Bun.serve({
  port: 0,
  fetch(req) {
    return new Response("hello from checkpoint");
  },
});
console.log("started");
`,
    'utf-8'
  );
  return entrypointPath;
}

describe('CheckpointBundler', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('produces a bundled output file', async () => {
    const entrypointPath = await createTestEntrypoint();
    const bundler = new CheckpointBundler();

    const result = await bundler.bundle({
      entrypointPath,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(existsSync(result.outputPath)).toBe(true);
    expect(result.outputPath).toEndWith('checkpoint.js');
  });

  it('returns hash and size', async () => {
    const entrypointPath = await createTestEntrypoint();
    const bundler = new CheckpointBundler();

    const result = await bundler.bundle({
      entrypointPath,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.size).toBeGreaterThan(0);
  });

  it('produces deterministic hash for same input', async () => {
    const entrypointPath = await createTestEntrypoint();
    const bundler = new CheckpointBundler();

    const result1 = await bundler.bundle({
      entrypointPath,
      outputDir: TEST_OUTPUT_DIR,
    });

    // Clean and rebuild
    await fs.unlink(result1.outputPath);

    const result2 = await bundler.bundle({
      entrypointPath,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result1.hash).toBe(result2.hash);
  });

  it('uses custom output filename', async () => {
    const entrypointPath = await createTestEntrypoint();
    const bundler = new CheckpointBundler();

    const result = await bundler.bundle({
      entrypointPath,
      outputDir: TEST_OUTPUT_DIR,
      outputFile: 'custom-bundle.js',
    });

    expect(result.outputPath).toEndWith('custom-bundle.js');
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it('throws on invalid entrypoint', async () => {
    const bundler = new CheckpointBundler();

    await expect(
      bundler.bundle({
        entrypointPath: '/nonexistent/path/entrypoint.ts',
        outputDir: TEST_OUTPUT_DIR,
      })
    ).rejects.toThrow();
  });
});
