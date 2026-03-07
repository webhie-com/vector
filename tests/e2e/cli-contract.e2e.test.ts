import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const CLI_ENTRY = resolve(PROJECT_ROOT, 'src/cli/index.ts');
const decoder = new TextDecoder();

function runCli(args: string[], cwd = PROJECT_ROOT): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(['bun', 'run', CLI_ENTRY, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  const output = `${decoder.decode(proc.stdout)}${decoder.decode(proc.stderr)}`;
  return {
    exitCode: proc.exitCode ?? 1,
    output,
  };
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'vector-cli-e2e-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('E2E CLI contract', () => {
  it('builds custom output path with baked artifacts', async () => {
    await withTempDir(async (tmp) => {
      const outDir = join(tmp, 'dist-custom');
      const result = runCli(
        ['build', '--config', './vector.config.ts', '--routes', './examples/routes', '--path', outDir],
        PROJECT_ROOT
      );

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(outDir, 'server.js'))).toBe(true);
      expect(existsSync(join(outDir, 'routes'))).toBe(true);
    });
  });

  it('rejects invalid start contract flags and missing build paths', () => {
    const configResult = runCli(['start', '--config', './vector.config.ts'], PROJECT_ROOT);
    expect(configResult.exitCode).not.toBe(0);
    expect(configResult.output).toContain('--config is not supported for `vector start`');

    const missingPath = runCli(['start', '--path', './tests/.missing-build-path'], PROJECT_ROOT);
    expect(missingPath.exitCode).not.toBe(0);
    expect(missingPath.output).toContain('Build path not found');
  });
});
