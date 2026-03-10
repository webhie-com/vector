import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CheckpointProcessManager } from '../src/checkpoint/process-manager';
import type { CheckpointManifest } from '../src/checkpoint/types';
import { AssetStore } from '../src/checkpoint/asset-store';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-process-mgr');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function createTestCheckpoint(
  version: string,
  options: { includeAsset?: boolean } = {}
): Promise<CheckpointManifest> {
  const versionDir = join(TEST_STORAGE_DIR, version);
  await fs.mkdir(versionDir, { recursive: true });

  // Create a minimal working checkpoint that listens on a Unix socket
  const checkpointCode = `
const socketPath = process.env.VECTOR_CHECKPOINT_SOCKET;

const server = Bun.serve({
  unix: socketPath,
  routes: {
    '/_vector/health': {
      GET: () => Response.json({ status: 'ok', version: '${version}' }),
    },
    '/test': {
      GET: () => Response.json({ message: 'hello from checkpoint ${version}' }),
    },
  },
  fetch(req) {
    return Response.json({ error: true, message: 'Not Found' }, { status: 404 });
  },
});

process.stdout.write('READY\\n');

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
`;

  await fs.writeFile(join(versionDir, 'checkpoint.js'), checkpointCode, 'utf-8');

  const assets: CheckpointManifest['assets'] = [];
  if (options.includeAsset) {
    const fixtureDir = join(TEST_STORAGE_DIR, 'fixtures', version);
    await fs.mkdir(fixtureDir, { recursive: true });
    const fixtureFile = join(fixtureDir, 'config.json');
    await fs.writeFile(fixtureFile, JSON.stringify({ version, feature: 'asset-materialization' }), 'utf-8');
    const store = new AssetStore(TEST_STORAGE_DIR);
    assets.push(await store.addSidecar(`fixtures/${version}/config.json`, fixtureFile));
  }

  const manifest: CheckpointManifest = {
    formatVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    entrypoint: 'checkpoint.js',
    routes: [{ method: 'GET', path: '/test' }],
    assets,
    bundleHash: 'test-hash',
    bundleSize: checkpointCode.length,
  };

  await fs.writeFile(join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return manifest;
}

describe('CheckpointProcessManager', () => {
  let processManager: CheckpointProcessManager;

  beforeEach(async () => {
    await cleanup();
    processManager = new CheckpointProcessManager(5000);
  });

  afterEach(async () => {
    await processManager.stopAll();
    await cleanup();
  });

  describe('spawn', () => {
    it('starts a checkpoint child process', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      const spawned = await processManager.spawn(manifest, TEST_STORAGE_DIR);

      expect(spawned.version).toBe('1.0.0');
      expect(spawned.pid).toBeGreaterThan(0);
      expect(spawned.socketPath).toContain('1.0.0/run.sock');
    });

    it('returns existing checkpoint if already running', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      const first = await processManager.spawn(manifest, TEST_STORAGE_DIR);
      const second = await processManager.spawn(manifest, TEST_STORAGE_DIR);

      expect(first.pid).toBe(second.pid);
    });

    it('throws when bundle file does not exist', async () => {
      const manifest: CheckpointManifest = {
        formatVersion: 1,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        entrypoint: 'nonexistent.js',
        routes: [],
        assets: [],
        bundleHash: 'test',
        bundleSize: 0,
      };

      await fs.mkdir(join(TEST_STORAGE_DIR, '1.0.0'), { recursive: true });

      await expect(processManager.spawn(manifest, TEST_STORAGE_DIR)).rejects.toThrow('not found');
    });

    it('materializes declared assets before process start', async () => {
      const manifest = await createTestCheckpoint('1.2.0', { includeAsset: true });
      await processManager.spawn(manifest, TEST_STORAGE_DIR);

      const logicalPath = manifest.assets[0].logicalPath;
      const materializedPath = join(TEST_STORAGE_DIR, '1.2.0', '_materialized', logicalPath);
      expect(existsSync(materializedPath)).toBe(true);
      const materialized = await fs.readFile(materializedPath, 'utf-8');
      expect(materialized).toContain('"asset-materialization"');
    });
  });

  describe('isRunning', () => {
    it('returns false for unknown version', () => {
      expect(processManager.isRunning('1.0.0')).toBe(false);
    });

    it('returns true after spawn', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      await processManager.spawn(manifest, TEST_STORAGE_DIR);

      expect(processManager.isRunning('1.0.0')).toBe(true);
    });

    it('returns false after stop', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      await processManager.spawn(manifest, TEST_STORAGE_DIR);
      await processManager.stop('1.0.0');

      expect(processManager.isRunning('1.0.0')).toBe(false);
    });
  });

  describe('stop', () => {
    it('stops a running checkpoint process', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      await processManager.spawn(manifest, TEST_STORAGE_DIR);

      expect(processManager.isRunning('1.0.0')).toBe(true);
      await processManager.stop('1.0.0');
      expect(processManager.isRunning('1.0.0')).toBe(false);
    });

    it('is a no-op for unknown version', async () => {
      await processManager.stop('nonexistent');
      // Should not throw
    });
  });

  describe('stopAll', () => {
    it('stops all running checkpoints', async () => {
      const manifest1 = await createTestCheckpoint('1.0.0');
      const manifest2 = await createTestCheckpoint('1.1.0');

      await processManager.spawn(manifest1, TEST_STORAGE_DIR);
      await processManager.spawn(manifest2, TEST_STORAGE_DIR);

      expect(processManager.getRunningVersions()).toHaveLength(2);

      await processManager.stopAll();

      expect(processManager.getRunningVersions()).toHaveLength(0);
    });
  });

  describe('health', () => {
    it('returns true for a healthy running checkpoint', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      await processManager.spawn(manifest, TEST_STORAGE_DIR);

      const healthy = await processManager.health('1.0.0');
      expect(healthy).toBe(true);
    });

    it('returns false for unknown version', async () => {
      const healthy = await processManager.health('nonexistent');
      expect(healthy).toBe(false);
    });

    it('returns false after stop', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      await processManager.spawn(manifest, TEST_STORAGE_DIR);
      await processManager.stop('1.0.0');

      const healthy = await processManager.health('1.0.0');
      expect(healthy).toBe(false);
    });
  });

  describe('getRunning', () => {
    it('returns undefined for unknown version', () => {
      expect(processManager.getRunning('1.0.0')).toBeUndefined();
    });

    it('returns SpawnedCheckpoint after spawn', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      await processManager.spawn(manifest, TEST_STORAGE_DIR);

      const spawned = processManager.getRunning('1.0.0');
      expect(spawned).toBeDefined();
      expect(spawned!.version).toBe('1.0.0');
    });
  });

  describe('getRunningVersions', () => {
    it('returns empty array initially', () => {
      expect(processManager.getRunningVersions()).toEqual([]);
    });

    it('returns list of running versions', async () => {
      const manifest1 = await createTestCheckpoint('1.0.0');
      const manifest2 = await createTestCheckpoint('2.0.0');

      await processManager.spawn(manifest1, TEST_STORAGE_DIR);
      await processManager.spawn(manifest2, TEST_STORAGE_DIR);

      const versions = processManager.getRunningVersions();
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('2.0.0');
    });
  });

  describe('edge cases', () => {
    it('cleans up stale socket file before spawn', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      const socketPath = join(TEST_STORAGE_DIR, '1.0.0', 'run.sock');

      // Create a stale socket file
      await fs.writeFile(socketPath, 'stale');
      expect(existsSync(socketPath)).toBe(true);

      // Spawn should succeed despite stale socket
      const spawned = await processManager.spawn(manifest, TEST_STORAGE_DIR);
      expect(spawned.version).toBe('1.0.0');
      expect(processManager.isRunning('1.0.0')).toBe(true);
    });

    it('concurrent spawns for same version return same process', async () => {
      const manifest = await createTestCheckpoint('1.0.0');

      // Launch two spawns concurrently
      const [first, second] = await Promise.all([
        processManager.spawn(manifest, TEST_STORAGE_DIR),
        processManager.spawn(manifest, TEST_STORAGE_DIR),
      ]);

      expect(first.pid).toBe(second.pid);
    });

    it('socket file is cleaned up after stop', async () => {
      const manifest = await createTestCheckpoint('1.0.0');
      const spawned = await processManager.spawn(manifest, TEST_STORAGE_DIR);
      const socketPath = spawned.socketPath;

      await processManager.stop('1.0.0');

      expect(existsSync(socketPath)).toBe(false);
    });
  });

  describe('idle shutdown', () => {
    it('stops idle checkpoints after timeout', async () => {
      const idleManager = new CheckpointProcessManager({
        readyTimeoutMs: 5000,
        idleTimeoutMs: 50,
      });

      try {
        const manifest = await createTestCheckpoint('3.0.0');
        await idleManager.spawn(manifest, TEST_STORAGE_DIR);
        expect(idleManager.isRunning('3.0.0')).toBe(true);

        await Bun.sleep(120);
        expect(idleManager.isRunning('3.0.0')).toBe(false);
      } finally {
        await idleManager.stopAll();
      }
    });

    it('extends lifetime when markUsed is called', async () => {
      const idleManager = new CheckpointProcessManager({
        readyTimeoutMs: 5000,
        idleTimeoutMs: 100,
      });

      try {
        const manifest = await createTestCheckpoint('4.0.0');
        await idleManager.spawn(manifest, TEST_STORAGE_DIR);
        expect(idleManager.isRunning('4.0.0')).toBe(true);

        await Bun.sleep(60);
        idleManager.markUsed('4.0.0');
        await Bun.sleep(60);
        expect(idleManager.isRunning('4.0.0')).toBe(true);

        await Bun.sleep(80);
        expect(idleManager.isRunning('4.0.0')).toBe(false);
      } finally {
        await idleManager.stopAll();
      }
    });
  });
});
