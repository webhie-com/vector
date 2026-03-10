import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CheckpointResolver } from '../src/checkpoint/resolver';
import { CheckpointManager } from '../src/checkpoint/manager';
import { CheckpointProcessManager } from '../src/checkpoint/process-manager';
import type { CheckpointManifest } from '../src/checkpoint/types';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-resolver');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function createFakeCheckpoint(
  manager: CheckpointManager,
  version: string,
  createdAt: string = new Date().toISOString()
): Promise<CheckpointManifest> {
  const versionDir = manager.versionDir(version);
  await fs.mkdir(versionDir, { recursive: true });

  const checkpointCode = `
const socketPath = process.env.VECTOR_CHECKPOINT_SOCKET;
const server = Bun.serve({
  unix: socketPath,
  routes: {
    '/_vector/health': {
      GET: () => Response.json({ status: 'ok', version: '${version}' }),
    },
    '/test': {
      GET: () => Response.json({ ok: true, version: '${version}' }),
    },
  },
  fetch(req) {
    return Response.json({ error: true, message: 'Not Found' }, { status: 404 });
  },
});
process.stdout.write('READY\\n');
process.on('SIGTERM', () => { server.stop(); process.exit(0); });
`;
  await fs.writeFile(join(versionDir, 'checkpoint.js'), checkpointCode, 'utf-8');

  const manifest: CheckpointManifest = {
    formatVersion: 1,
    version,
    createdAt,
    entrypoint: 'checkpoint.js',
    routes: [],
    assets: [],
    bundleHash: 'test',
    bundleSize: checkpointCode.length,
  };
  await fs.writeFile(join(versionDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
  return manifest;
}

describe('CheckpointResolver', () => {
  let manager: CheckpointManager;
  let processManager: CheckpointProcessManager;
  let resolver: CheckpointResolver;

  beforeEach(async () => {
    await cleanup();
    manager = new CheckpointManager({ storageDir: TEST_STORAGE_DIR });
    processManager = new CheckpointProcessManager({ readyTimeoutMs: 5000, idleTimeoutMs: 60_000 });
    resolver = new CheckpointResolver(manager, processManager);
  });

  afterEach(async () => {
    await processManager.stopAll();
    await cleanup();
  });

  it('returns null when no checkpoints exist', async () => {
    const result = await resolver.resolve(new Request('http://localhost/test'));
    expect(result).toBeNull();
  });

  it('routes by version header and auto-spawns requested checkpoint', async () => {
    await createFakeCheckpoint(manager, '1.0.0');

    expect(processManager.isRunning('1.0.0')).toBe(false);

    const result = await resolver.resolve(
      new Request('http://localhost/test', {
        headers: {
          'x-vector-checkpoint-version': '1.0.0',
        },
      })
    );

    expect(result).not.toBeNull();
    expect(result).toContain('1.0.0/run.sock');
    expect(processManager.isRunning('1.0.0')).toBe(true);
  });

  it('returns null when no version header is provided', async () => {
    await createFakeCheckpoint(manager, '1.0.0');
    await manager.setActive('1.0.0');

    const result = await resolver.resolve(new Request('http://localhost/test'));
    expect(result).toBeNull();
  });

  it('returns null for unknown requested version header', async () => {
    await createFakeCheckpoint(manager, '1.0.0');

    const result = await resolver.resolve(
      new Request('http://localhost/test', {
        headers: {
          'x-vector-checkpoint-version': '9.9.9',
        },
      })
    );
    expect(result).toBeNull();
  });

  it('can route different requests to different versions via header', async () => {
    await createFakeCheckpoint(manager, '1.0.0');
    await createFakeCheckpoint(manager, '2.0.0');

    const first = await resolver.resolve(
      new Request('http://localhost/test', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    const second = await resolver.resolve(
      new Request('http://localhost/test', {
        headers: { 'x-vector-checkpoint-version': '2.0.0' },
      })
    );

    expect(first).toContain('1.0.0/run.sock');
    expect(second).toContain('2.0.0/run.sock');
    expect(processManager.getRunningVersions()).toHaveLength(2);
  });
});
