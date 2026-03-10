import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint/manager';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-cli-checkpoints');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function createFakeCheckpoint(manager: CheckpointManager, version: string) {
  const versionDir = manager.versionDir(version);
  await fs.mkdir(versionDir, { recursive: true });

  const manifest = {
    formatVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    entrypoint: 'checkpoint.js',
    routes: [{ method: 'GET', path: '/test' }],
    assets: [],
    bundleHash: 'abc123def456',
    bundleSize: 1024,
  };

  await fs.writeFile(join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  await fs.writeFile(join(versionDir, 'checkpoint.js'), '// bundle', 'utf-8');
  return manifest;
}

describe('Checkpoint CLI (via CheckpointManager)', () => {
  let manager: CheckpointManager;

  beforeEach(async () => {
    await cleanup();
    manager = new CheckpointManager({ storageDir: TEST_STORAGE_DIR });
  });

  afterEach(cleanup);

  describe('publish workflow', () => {
    it('publishes a checkpoint from fixture routes', async () => {
      const manifest = await manager.publish({
        version: '1.0.0',
        routesDir: './tests/fixtures/routes',
      });

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.formatVersion).toBe(1);
      expect(manifest.bundleHash).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.bundleSize).toBeGreaterThan(0);
      expect(manifest.entrypoint).toBe('checkpoint.js');

      // Verify manifest file exists
      const readBack = await manager.readManifest('1.0.0');
      expect(readBack.version).toBe('1.0.0');

      // Verify bundle file exists
      const bundlePath = join(manager.versionDir('1.0.0'), 'checkpoint.js');
      expect(existsSync(bundlePath)).toBe(true);
    });

    it('overwrites existing version on re-publish', async () => {
      await manager.publish({
        version: '1.0.0',
        routesDir: './tests/fixtures/routes',
      });

      const manifest2 = await manager.publish({
        version: '1.0.0',
        routesDir: './tests/fixtures/routes',
      });

      expect(manifest2.version).toBe('1.0.0');
      const versions = await manager.listVersions();
      const v100Count = versions.filter((v) => v.version === '1.0.0').length;
      expect(v100Count).toBe(1);
    });
  });

  describe('list workflow', () => {
    it('lists published checkpoints', async () => {
      await createFakeCheckpoint(manager, '1.0.0');
      await createFakeCheckpoint(manager, '2.0.0');

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(2);
    });

    it('shows active indicator', async () => {
      await createFakeCheckpoint(manager, '1.0.0');
      await createFakeCheckpoint(manager, '2.0.0');
      await manager.setActive('1.0.0');

      const active = await manager.getActive();
      expect(active?.version).toBe('1.0.0');
    });
  });

  describe('rollback workflow', () => {
    it('sets active pointer to specified version', async () => {
      await createFakeCheckpoint(manager, '1.0.0');
      await createFakeCheckpoint(manager, '2.0.0');

      await manager.setActive('2.0.0');
      expect((await manager.getActive())?.version).toBe('2.0.0');

      await manager.setActive('1.0.0');
      expect((await manager.getActive())?.version).toBe('1.0.0');
    });

    it('rejects rollback to nonexistent version', async () => {
      await expect(manager.setActive('nonexistent')).rejects.toThrow('does not exist');
    });
  });

  describe('remove workflow', () => {
    it('removes a checkpoint', async () => {
      await createFakeCheckpoint(manager, '1.0.0');
      expect(existsSync(manager.versionDir('1.0.0'))).toBe(true);

      await manager.remove('1.0.0');
      expect(existsSync(manager.versionDir('1.0.0'))).toBe(false);
    });

    it('refuses to remove active checkpoint', async () => {
      await createFakeCheckpoint(manager, '1.0.0');
      await manager.setActive('1.0.0');

      await expect(manager.remove('1.0.0')).rejects.toThrow('Cannot remove active');
    });

    it('rejects removing nonexistent version', async () => {
      await manager.ensureStorageDir();
      await expect(manager.remove('nonexistent')).rejects.toThrow('does not exist');
    });
  });
});
