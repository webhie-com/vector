import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
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
  const dir = await mkdtemp(join(tmpdir(), 'vector-cli-contract-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('CLI build/start contract', () => {
  it('builds server artifacts to explicit --path with explicit --config/--routes', async () => {
    await withTempDir(async (tmp) => {
      const outDir = join(tmp, 'build-out');
      const result = runCli(
        ['build', '--config', './vector.config.ts', '--routes', './examples/routes', '--path', outDir],
        PROJECT_ROOT
      );

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(outDir, 'server.js'))).toBe(true);
      expect(existsSync(join(outDir, 'routes', 'health.js'))).toBe(true);
      expect(existsSync(join(outDir, 'routes', 'events.js'))).toBe(true);
    });
  });

  it('removes stale built route bundles on rebuild', async () => {
    await withTempDir(async (tmp) => {
      const routesDir = join(tmp, 'routes');
      const outDir = join(tmp, 'out');
      await mkdir(routesDir, { recursive: true });

      await writeFile(
        join(routesDir, 'a.ts'),
        "export default async function a(){ return new Response('a'); }\n",
        'utf-8'
      );
      await writeFile(
        join(routesDir, 'b.ts'),
        "export default async function b(){ return new Response('b'); }\n",
        'utf-8'
      );

      const firstBuild = runCli(['build', '--routes', routesDir, '--path', outDir], PROJECT_ROOT);
      expect(firstBuild.exitCode).toBe(0);
      expect(existsSync(join(outDir, 'routes', 'a.js'))).toBe(true);
      expect(existsSync(join(outDir, 'routes', 'b.js'))).toBe(true);

      await rm(join(routesDir, 'b.ts'));

      const secondBuild = runCli(['build', '--routes', routesDir, '--path', outDir], PROJECT_ROOT);
      expect(secondBuild.exitCode).toBe(0);
      expect(existsSync(join(outDir, 'routes', 'a.js'))).toBe(true);
      expect(existsSync(join(outDir, 'routes', 'b.js'))).toBe(false);
    });
  });

  it('fails build when explicit --config path is missing', () => {
    const result = runCli(['build', '--config', './tests/.missing-config.ts'], PROJECT_ROOT);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Config file not found');
  });

  it('fails build when explicit --routes path is missing', () => {
    const result = runCli(['build', '--routes', './tests/.missing-routes'], PROJECT_ROOT);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Routes directory not found');
  });

  it('fails build when --path overlaps source routes directory', async () => {
    await withTempDir(async (tmp) => {
      const routesDir = join(tmp, 'routes');
      await mkdir(routesDir, { recursive: true });
      await writeFile(
        join(routesDir, 'index.ts'),
        "export default async function root(){ return new Response('ok'); }\n",
        'utf-8'
      );

      const result = runCli(['build', '--routes', routesDir, '--path', routesDir], PROJECT_ROOT);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('Build output overlaps source routes');
    });
  });

  it('rejects start-time --config and --routes overrides', () => {
    const configResult = runCli(['start', '--config', './vector.config.ts'], PROJECT_ROOT);
    expect(configResult.exitCode).not.toBe(0);
    expect(configResult.output).toContain('--config is not supported for `vector start`');

    const routesResult = runCli(['start', '--routes', './examples/routes'], PROJECT_ROOT);
    expect(routesResult.exitCode).not.toBe(0);
    expect(routesResult.output).toContain('--routes is not supported for `vector start`');
  });

  it('fails start when default build artifacts are missing', async () => {
    await withTempDir(async (tmp) => {
      const result = runCli(['start'], tmp);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('Built server not found');
    });
  });

  it('fails start when build entry exists but sibling routes dir is missing', async () => {
    await withTempDir(async (tmp) => {
      const entryPath = join(tmp, 'server.js');
      await writeFile(entryPath, "console.log('placeholder');\n", 'utf-8');

      const result = runCli(['start', '--path', entryPath], PROJECT_ROOT);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('Build routes directory not found');
    });
  });

  it('fails start when build directory exists but server.js is missing', async () => {
    await withTempDir(async (tmp) => {
      const buildDir = join(tmp, 'build-dir');
      await mkdir(buildDir, { recursive: true });

      const result = runCli(['start', '--path', buildDir], PROJECT_ROOT);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('Build entry not found');
    });
  });
});
