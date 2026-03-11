import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint/manager';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-checkpoints');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

function createManager(config?: { maxCheckpoints?: number }) {
  return new CheckpointManager({
    storageDir: TEST_STORAGE_DIR,
    ...config,
  });
}

async function createFakeCheckpoint(manager: CheckpointManager, version: string, createdAt?: string) {
  const versionDir = manager.versionDir(version);
  await fs.mkdir(versionDir, { recursive: true });

  const manifest = {
    formatVersion: 1,
    version,
    createdAt: createdAt ?? new Date().toISOString(),
    entrypoint: 'checkpoint.js',
    routes: [{ method: 'GET', path: '/test' }],
    assets: [],
    bundleHash: 'abc123',
    bundleSize: 1024,
  };

  await fs.writeFile(join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Create a fake bundle file
  await fs.writeFile(join(versionDir, 'checkpoint.js'), '// fake bundle', 'utf-8');

  return manifest;
}

describe('CheckpointManager', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe('constructor', () => {
    it('uses default storage dir when none provided', () => {
      const manager = new CheckpointManager();
      expect(manager.getStorageDir()).toContain('.vector/checkpoints');
    });

    it('uses custom storage dir', () => {
      const manager = createManager();
      expect(manager.getStorageDir()).toBe(TEST_STORAGE_DIR);
    });
  });

  describe('ensureStorageDir', () => {
    it('creates storage directory recursively', async () => {
      const manager = createManager();
      expect(existsSync(TEST_STORAGE_DIR)).toBe(false);

      await manager.ensureStorageDir();
      expect(existsSync(TEST_STORAGE_DIR)).toBe(true);
    });

    it('is idempotent', async () => {
      const manager = createManager();
      await manager.ensureStorageDir();
      await manager.ensureStorageDir();
      expect(existsSync(TEST_STORAGE_DIR)).toBe(true);
    });
  });

  describe('versionDir', () => {
    it('returns path under storage dir', () => {
      const manager = createManager();
      expect(manager.versionDir('1.0.0')).toBe(join(TEST_STORAGE_DIR, '1.0.0'));
    });
  });

  describe('socketPath', () => {
    it('returns socket path inside version dir', () => {
      const manager = createManager();
      expect(manager.socketPath('1.0.0')).toBe(join(TEST_STORAGE_DIR, '1.0.0', 'run.sock'));
    });

    it('falls back to a short socket path when default path is too long', () => {
      const longStorageDir = join(TEST_STORAGE_DIR, 'a'.repeat(120), 'b'.repeat(120));
      const manager = new CheckpointManager({ storageDir: longStorageDir });
      const defaultPath = join(longStorageDir, '1.0.0', 'run.sock');
      const socketPath = manager.socketPath('1.0.0');

      if (process.platform === 'win32') {
        expect(socketPath).toBe(defaultPath);
        return;
      }

      expect(socketPath).not.toBe(defaultPath);
      expect(Buffer.byteLength(socketPath, 'utf8')).toBeLessThanOrEqual(103);
      expect(socketPath.endsWith('.sock')).toBe(true);
    });
  });

  describe('listVersions', () => {
    it('returns empty array when no versions exist', async () => {
      const manager = createManager();
      const versions = await manager.listVersions();
      expect(versions).toEqual([]);
    });

    it('returns manifests sorted by createdAt descending', async () => {
      const manager = createManager();

      await createFakeCheckpoint(manager, '1.0.0', '2024-01-01T00:00:00Z');
      await createFakeCheckpoint(manager, '1.1.0', '2024-02-01T00:00:00Z');
      await createFakeCheckpoint(manager, '1.0.1', '2024-01-15T00:00:00Z');

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe('1.1.0');
      expect(versions[1].version).toBe('1.0.1');
      expect(versions[2].version).toBe('1.0.0');
    });

    it('skips directories without manifest.json', async () => {
      const manager = createManager();
      await manager.ensureStorageDir();
      await fs.mkdir(join(TEST_STORAGE_DIR, 'no-manifest'), { recursive: true });

      await createFakeCheckpoint(manager, '1.0.0');

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('1.0.0');
    });
  });

  describe('readManifest / writeManifest', () => {
    it('round-trips manifest JSON', async () => {
      const manager = createManager();
      const manifest = await createFakeCheckpoint(manager, '1.0.0');

      const read = await manager.readManifest('1.0.0');
      expect(read.version).toBe(manifest.version);
      expect(read.bundleHash).toBe(manifest.bundleHash);
      expect(read.routes).toEqual(manifest.routes);
    });

    it('throws on missing version', async () => {
      const manager = createManager();
      await expect(manager.readManifest('nonexistent')).rejects.toThrow();
    });

    it('defaults formatVersion to 1 for legacy manifests', async () => {
      const manager = createManager();
      const versionDir = manager.versionDir('legacy-1');
      await fs.mkdir(versionDir, { recursive: true });

      await fs.writeFile(
        join(versionDir, 'manifest.json'),
        JSON.stringify(
          {
            version: 'legacy-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            entrypoint: 'checkpoint.js',
            routes: [],
            assets: [],
            bundleHash: 'legacy',
            bundleSize: 123,
          },
          null,
          2
        ),
        'utf-8'
      );

      const read = await manager.readManifest('legacy-1');
      expect(read.formatVersion).toBe(1);
    });

    it('infers gzip codec for legacy assets when blob path ends with .gz', async () => {
      const manager = createManager();
      const versionDir = manager.versionDir('legacy-codec-gzip');
      await fs.mkdir(versionDir, { recursive: true });

      await fs.writeFile(
        join(versionDir, 'manifest.json'),
        JSON.stringify(
          {
            version: 'legacy-codec-gzip',
            createdAt: '2024-01-01T00:00:00.000Z',
            entrypoint: 'checkpoint.js',
            routes: [],
            assets: [
              {
                type: 'embedded',
                logicalPath: 'fixtures/test.json',
                storedPath: '/tmp/blobs/abc123.gz',
                hash: 'abc123',
                size: 123,
              },
            ],
            bundleHash: 'legacy',
            bundleSize: 123,
          },
          null,
          2
        ),
        'utf-8'
      );

      const read = await manager.readManifest('legacy-codec-gzip');
      expect(read.assets).toHaveLength(1);
      expect(read.assets[0].codec).toBe('gzip');
    });

    it('defaults codec to none for legacy assets without .gz blob paths', async () => {
      const manager = createManager();
      const versionDir = manager.versionDir('legacy-codec-none');
      await fs.mkdir(versionDir, { recursive: true });

      await fs.writeFile(
        join(versionDir, 'manifest.json'),
        JSON.stringify(
          {
            version: 'legacy-codec-none',
            createdAt: '2024-01-01T00:00:00.000Z',
            entrypoint: 'checkpoint.js',
            routes: [],
            assets: [
              {
                type: 'embedded',
                logicalPath: 'fixtures/test.json',
                storedPath: '/tmp/blobs/abc123',
                hash: 'abc123',
                size: 123,
              },
            ],
            bundleHash: 'legacy',
            bundleSize: 123,
          },
          null,
          2
        ),
        'utf-8'
      );

      const read = await manager.readManifest('legacy-codec-none');
      expect(read.assets).toHaveLength(1);
      expect(read.assets[0].codec).toBe('none');
    });
  });

  describe('setActive / getActive', () => {
    it('returns null when no active pointer exists', async () => {
      const manager = createManager();
      const active = await manager.getActive();
      expect(active).toBeNull();
    });

    it('sets and retrieves active pointer', async () => {
      const manager = createManager();
      await createFakeCheckpoint(manager, '1.0.0');

      await manager.setActive('1.0.0');
      const active = await manager.getActive();

      expect(active).not.toBeNull();
      expect(active!.version).toBe('1.0.0');
      expect(active!.activatedAt).toBeTruthy();
    });

    it('overwrites previous active pointer', async () => {
      const manager = createManager();
      await createFakeCheckpoint(manager, '1.0.0');
      await createFakeCheckpoint(manager, '1.1.0');

      await manager.setActive('1.0.0');
      await manager.setActive('1.1.0');

      const active = await manager.getActive();
      expect(active!.version).toBe('1.1.0');
    });

    it('throws when version does not exist', async () => {
      const manager = createManager();
      await manager.ensureStorageDir();

      await expect(manager.setActive('nonexistent')).rejects.toThrow('does not exist');
    });

    it('throws when version has no manifest', async () => {
      const manager = createManager();
      await fs.mkdir(manager.versionDir('1.0.0'), { recursive: true });

      await expect(manager.setActive('1.0.0')).rejects.toThrow('no manifest');
    });
  });

  describe('remove', () => {
    it('removes a version directory', async () => {
      const manager = createManager();
      await createFakeCheckpoint(manager, '1.0.0');

      expect(existsSync(manager.versionDir('1.0.0'))).toBe(true);
      await manager.remove('1.0.0');
      expect(existsSync(manager.versionDir('1.0.0'))).toBe(false);
    });

    it('throws when removing active version', async () => {
      const manager = createManager();
      await createFakeCheckpoint(manager, '1.0.0');
      await manager.setActive('1.0.0');

      await expect(manager.remove('1.0.0')).rejects.toThrow('Cannot remove active');
    });

    it('throws when version does not exist', async () => {
      const manager = createManager();
      await manager.ensureStorageDir();

      await expect(manager.remove('nonexistent')).rejects.toThrow('does not exist');
    });
  });

  describe('pruneOld', () => {
    it('removes oldest versions beyond maxCheckpoints', async () => {
      const manager = createManager({ maxCheckpoints: 2 });

      await createFakeCheckpoint(manager, '1.0.0', '2024-01-01T00:00:00Z');
      await createFakeCheckpoint(manager, '1.1.0', '2024-02-01T00:00:00Z');
      await createFakeCheckpoint(manager, '1.2.0', '2024-03-01T00:00:00Z');

      await manager.pruneOld();

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe('1.2.0');
      expect(versions[1].version).toBe('1.1.0');
    });

    it('never removes the active version', async () => {
      const manager = createManager({ maxCheckpoints: 1 });

      await createFakeCheckpoint(manager, '1.0.0', '2024-01-01T00:00:00Z');
      await createFakeCheckpoint(manager, '1.1.0', '2024-02-01T00:00:00Z');
      await manager.setActive('1.0.0');

      await manager.pruneOld();

      // Active version 1.0.0 should survive even though it's oldest
      expect(existsSync(manager.versionDir('1.0.0'))).toBe(true);
    });

    it('does nothing when maxCheckpoints is 0', async () => {
      const manager = createManager({ maxCheckpoints: 0 });

      await createFakeCheckpoint(manager, '1.0.0');
      await createFakeCheckpoint(manager, '1.1.0');
      await createFakeCheckpoint(manager, '1.2.0');

      await manager.pruneOld();

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(3);
    });

    it('active version survives and non-active versions are pruned', async () => {
      const manager = createManager({ maxCheckpoints: 1 });

      await createFakeCheckpoint(manager, '1.0.0', '2024-01-01T00:00:00Z');
      await createFakeCheckpoint(manager, '1.1.0', '2024-02-01T00:00:00Z');
      await manager.setActive('1.0.0');

      await manager.pruneOld();

      // 1.1.0 is the newest, so it stays (within maxCheckpoints=1)
      // 1.0.0 is the oldest but active, so it also stays
      expect(existsSync(manager.versionDir('1.0.0'))).toBe(true);
      expect(existsSync(manager.versionDir('1.1.0'))).toBe(true);
    });
  });

  describe('listVersions edge cases', () => {
    it('skips directories with corrupted manifest.json', async () => {
      const manager = createManager();
      await createFakeCheckpoint(manager, '1.0.0');

      // Create a corrupted manifest
      const corruptDir = join(TEST_STORAGE_DIR, 'corrupt');
      await fs.mkdir(corruptDir, { recursive: true });
      await fs.writeFile(join(corruptDir, 'manifest.json'), '{invalid json}', 'utf-8');

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('1.0.0');
    });

    it('ignores active.json file in storage dir', async () => {
      const manager = createManager();
      await createFakeCheckpoint(manager, '1.0.0');
      await manager.setActive('1.0.0');

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(1);
    });
  });

  describe('getActive edge cases', () => {
    it('returns null for corrupted active.json', async () => {
      const manager = createManager();
      await manager.ensureStorageDir();
      await fs.writeFile(join(TEST_STORAGE_DIR, 'active.json'), '{not valid json}', 'utf-8');

      const active = await manager.getActive();
      expect(active).toBeNull();
    });
  });

  describe('publish', () => {
    it('publishes a checkpoint and creates manifest + bundle', async () => {
      const manager = createManager();

      const manifest = await manager.publish({
        version: '1.0.0',
        routesDir: './tests/fixtures/routes',
      });

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.bundleHash).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.bundleSize).toBeGreaterThan(0);
      expect(manifest.entrypoint).toBe('checkpoint.js');
      expect(manifest.checkpointArchivePath).toBeTruthy();
      expect(manifest.checkpointArchiveHash).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.checkpointArchiveSize).toBeGreaterThan(0);
      expect(manifest.checkpointArchiveCodec).toBe('gzip');

      // Verify bundle exists
      const bundlePath = join(manager.versionDir('1.0.0'), 'checkpoint.js');
      expect(existsSync(bundlePath)).toBe(true);

      // Verify compressed archive exists and starts with gzip magic number.
      const archivePath = join(manager.getStorageDir(), manifest.checkpointArchivePath!);
      expect(existsSync(archivePath)).toBe(true);
      const archiveBytes = readFileSync(archivePath);
      expect(archiveBytes[0]).toBe(0x1f);
      expect(archiveBytes[1]).toBe(0x8b);

      // Verify entrypoint.ts was cleaned up
      const entrypointPath = join(manager.versionDir('1.0.0'), 'entrypoint.ts');
      expect(existsSync(entrypointPath)).toBe(false);
    });

    it('publishes with asset paths', async () => {
      const manager = createManager();

      // Create a small fixture file for embedded asset
      const fixtureDir = join(TEST_STORAGE_DIR, 'fixture-assets');
      await fs.mkdir(fixtureDir, { recursive: true });
      const smallFile = join(fixtureDir, 'config.json');
      await fs.writeFile(smallFile, '{"key":"value"}', 'utf-8');

      const manifest = await manager.publish({
        version: '1.0.0',
        routesDir: './tests/fixtures/routes',
        embeddedAssetPaths: [smallFile],
      });

      expect(manifest.assets).toHaveLength(1);
      expect(manifest.assets[0].type).toBe('embedded');
      expect(manifest.assets[0].size).toBe(15);
      expect(manifest.assets[0].contentHash).toBe(manifest.assets[0].hash);
      expect(manifest.assets[0].blobHash).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.assets[0].blobPath).toContain('_assets/blobs/');
      expect(manifest.assets[0].codec).toBe('gzip');
    });

    it('packages archive without manifest.json to avoid self-referential hash drift', async () => {
      const manager = createManager();
      const manifest = await manager.publish({
        version: '3.0.0',
        routesDir: './tests/fixtures/routes',
      });

      const archivePath = join(manager.getStorageDir(), manifest.checkpointArchivePath!);
      const Archive = (Bun as any).Archive;
      if (typeof Archive === 'function') {
        const compressed = readFileSync(archivePath);
        const tarBytes = Bun.gunzipSync(
          new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)
        );
        const parsed = new Archive(tarBytes);
        const files = await parsed.files();
        expect(files.has('manifest.json')).toBe(false);
        expect(files.has('checkpoint.js')).toBe(true);
        return;
      }

      const listed = Bun.spawnSync(['tar', '-tzf', archivePath], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(listed.exitCode).toBe(0);
      const fileList = new TextDecoder().decode(listed.stdout).split('\n').filter(Boolean);
      expect(fileList.includes('manifest.json')).toBe(false);
      expect(fileList.includes('checkpoint.js')).toBe(true);
    });

    it('triggers pruneOld after publish', async () => {
      const manager = createManager({ maxCheckpoints: 1 });

      await manager.publish({
        version: '1.0.0',
        routesDir: './tests/fixtures/routes',
      });
      await manager.publish({
        version: '2.0.0',
        routesDir: './tests/fixtures/routes',
      });

      const versions = await manager.listVersions();
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('2.0.0');
    });
  });
});
