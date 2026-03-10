import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { extname, join } from 'node:path';
import { AssetStore } from '../src/checkpoint/asset-store';
import { CheckpointArtifactMaterializer } from '../src/checkpoint/artifacts/materializer';
import type { CheckpointManifest } from '../src/checkpoint/types';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-materializer');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function createManifest(version: string): Promise<CheckpointManifest> {
  const versionDir = join(TEST_STORAGE_DIR, version);
  await fs.mkdir(versionDir, { recursive: true });
  const fixtureDir = join(TEST_STORAGE_DIR, 'fixtures');
  await fs.mkdir(fixtureDir, { recursive: true });
  const fixtureFile = join(fixtureDir, `${version}.json`);
  await fs.writeFile(fixtureFile, JSON.stringify({ version, ok: true }), 'utf-8');

  const store = new AssetStore(TEST_STORAGE_DIR);
  const asset = await store.addSidecar(`fixtures/${version}.json`, fixtureFile);

  const manifest: CheckpointManifest = {
    formatVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    entrypoint: 'checkpoint.js',
    routes: [],
    assets: [asset],
    bundleHash: 'x',
    bundleSize: 1,
  };

  return manifest;
}

describe('CheckpointArtifactMaterializer', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('materializes assets to version-local logical paths', async () => {
    const manifest = await createManifest('1.0.0');
    const materializer = new CheckpointArtifactMaterializer();

    await materializer.materialize(manifest, TEST_STORAGE_DIR);

    const logicalPath = manifest.assets[0].logicalPath;
    const materializedPath = join(TEST_STORAGE_DIR, '1.0.0', '_materialized', logicalPath);
    expect(existsSync(materializedPath)).toBe(true);
    expect(existsSync(join(TEST_STORAGE_DIR, '1.0.0', '.assets.ready.json'))).toBe(true);

    const content = await fs.readFile(materializedPath, 'utf-8');
    expect(content).toContain('"ok":true');
    expect(manifest.assets[0].materializedPath).toContain('_materialized/');
  });

  it('fails when blob checksum does not match manifest hash', async () => {
    const manifest = await createManifest('1.1.0');
    const asset = manifest.assets[0];
    const blobPath = asset.blobPath ? join(TEST_STORAGE_DIR, asset.blobPath) : asset.storedPath;
    await fs.writeFile(blobPath, Bun.gzipSync(new TextEncoder().encode('tampered')));

    const materializer = new CheckpointArtifactMaterializer();
    await expect(materializer.materialize(manifest, TEST_STORAGE_DIR)).rejects.toThrow('checksum mismatch');
  });

  it('re-materializes when marker exists but materialized file is missing', async () => {
    const manifest = await createManifest('1.2.0');
    const materializer = new CheckpointArtifactMaterializer();
    await materializer.materialize(manifest, TEST_STORAGE_DIR);

    const logicalPath = manifest.assets[0].logicalPath;
    const materializedPath = join(TEST_STORAGE_DIR, '1.2.0', '_materialized', logicalPath);
    await fs.rm(materializedPath, { force: true });

    await materializer.materialize(manifest, TEST_STORAGE_DIR);
    expect(existsSync(materializedPath)).toBe(true);
  });

  it('repairs decompressed cache corruption before linking', async () => {
    const manifest = await createManifest('1.3.0');
    const materializer = new CheckpointArtifactMaterializer();
    await materializer.materialize(manifest, TEST_STORAGE_DIR);

    const asset = manifest.assets[0];
    const cachePath = join(
      TEST_STORAGE_DIR,
      '_assets/cache',
      `${asset.contentHash ?? asset.hash}${extname(asset.logicalPath) || '.bin'}`
    );
    await fs.writeFile(cachePath, 'tampered-cache', 'utf-8');

    await fs.rm(join(TEST_STORAGE_DIR, '1.3.0', '.assets.ready.json'), { force: true });
    await fs.rm(join(TEST_STORAGE_DIR, '1.3.0', '_materialized'), { recursive: true, force: true });

    await materializer.materialize(manifest, TEST_STORAGE_DIR);
    const materializedPath = join(TEST_STORAGE_DIR, '1.3.0', '_materialized', asset.logicalPath);
    const content = await fs.readFile(materializedPath, 'utf-8');
    expect(content).toContain('"ok":true');
  });
});
