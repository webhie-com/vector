import { existsSync, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ActivePointer, CheckpointConfig, CheckpointManifest, CheckpointPublishOptions } from './types';
import { CHECKPOINT_FORMAT_VERSION } from './types';
import { AssetStore } from './asset-store';
import { CheckpointBundler } from './bundler';
import { CheckpointEntrypointGenerator } from './entrypoint-generator';
import { CheckpointPackager } from './artifacts/packager';
import { resolveCheckpointSocketPath } from './socket-path';

const DEFAULT_STORAGE_DIR = '.vector/checkpoints';
const ACTIVE_POINTER_FILE = 'active.json';

function inferLegacyAssetCodec(asset: {
  codec?: 'none' | 'gzip';
  blobPath?: string;
  storedPath?: string;
}): 'none' | 'gzip' {
  if (asset.codec) {
    return asset.codec;
  }

  const rawPath = (asset.blobPath ?? asset.storedPath ?? '').trim().toLowerCase();
  return rawPath.endsWith('.gz') ? 'gzip' : 'none';
}

export class CheckpointManager {
  private storageDir: string;
  private maxCheckpoints: number;

  constructor(config: CheckpointConfig = {}) {
    this.storageDir = resolve(process.cwd(), config.storageDir ?? DEFAULT_STORAGE_DIR);
    this.maxCheckpoints = config.maxCheckpoints ?? 10;
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  versionDir(version: string): string {
    return join(this.storageDir, version);
  }

  socketPath(version: string): string {
    return resolveCheckpointSocketPath(this.storageDir, version);
  }

  async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  async publish(options: CheckpointPublishOptions): Promise<CheckpointManifest> {
    await this.ensureStorageDir();

    const versionDir = this.versionDir(options.version);
    await fs.mkdir(versionDir, { recursive: true });

    // Generate entrypoint
    const generator = new CheckpointEntrypointGenerator();
    const entrypointPath = await generator.generate({
      version: options.version,
      outputDir: versionDir,
      routesDir: resolve(process.cwd(), options.routesDir),
      socketPath: this.socketPath(options.version),
    });

    // Bundle
    const bundler = new CheckpointBundler();
    const bundleResult = await bundler.bundle({
      entrypointPath,
      outputDir: versionDir,
    });

    // Collect assets
    const assetStore = new AssetStore(this.storageDir);
    const assets = await assetStore.collect(options.embeddedAssetPaths ?? [], options.sidecarAssetPaths ?? []);
    assetStore.validateBudgets(assets);

    // Build manifest
    const manifest: CheckpointManifest = {
      formatVersion: CHECKPOINT_FORMAT_VERSION,
      version: options.version,
      createdAt: new Date().toISOString(),
      entrypoint: 'checkpoint.js',
      routes: generator.getDiscoveredRoutes(),
      assets,
      bundleHash: bundleResult.hash,
      bundleSize: bundleResult.size,
      checkpointArchivePath: undefined,
      checkpointArchiveHash: undefined,
      checkpointArchiveSize: undefined,
      checkpointArchiveCodec: undefined,
    };

    await this.writeManifest(options.version, manifest);

    // Clean up entrypoint source (keep only the bundle)
    try {
      await fs.unlink(entrypointPath);
    } catch {
      // Ignore cleanup failures
    }

    // Package checkpoint folder with compression for local transport workflows.
    const packager = new CheckpointPackager(this.storageDir);
    const archive = await packager.packageVersion(options.version);
    manifest.checkpointArchivePath = archive.archivePath;
    manifest.checkpointArchiveHash = archive.archiveHash;
    manifest.checkpointArchiveSize = archive.archiveSize;
    manifest.checkpointArchiveCodec = archive.codec;
    await this.writeManifest(options.version, manifest);

    await this.pruneOld();

    return manifest;
  }

  async readManifest(version: string): Promise<CheckpointManifest> {
    const manifestPath = join(this.versionDir(version), 'manifest.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    return this.normalizeManifest(JSON.parse(content) as Partial<CheckpointManifest>);
  }

  async writeManifest(version: string, manifest: CheckpointManifest): Promise<void> {
    const manifestPath = join(this.versionDir(version), 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async listVersions(): Promise<CheckpointManifest[]> {
    if (!existsSync(this.storageDir)) {
      return [];
    }

    const entries = await fs.readdir(this.storageDir);
    const manifests: CheckpointManifest[] = [];

    for (const entry of entries) {
      const manifestPath = join(this.storageDir, entry, 'manifest.json');
      if (existsSync(manifestPath)) {
        try {
          const content = await fs.readFile(manifestPath, 'utf-8');
          manifests.push(this.normalizeManifest(JSON.parse(content) as Partial<CheckpointManifest>));
        } catch {
          // Skip corrupted manifests
        }
      }
    }

    // Sort by createdAt descending (newest first)
    manifests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return manifests;
  }

  async getActive(): Promise<ActivePointer | null> {
    const pointerPath = join(this.storageDir, ACTIVE_POINTER_FILE);
    if (!existsSync(pointerPath)) {
      return null;
    }

    try {
      const content = await fs.readFile(pointerPath, 'utf-8');
      return JSON.parse(content) as ActivePointer;
    } catch {
      return null;
    }
  }

  async setActive(version: string): Promise<void> {
    // Verify version exists
    const versionDir = this.versionDir(version);
    if (!existsSync(versionDir)) {
      throw new Error(`Checkpoint version ${version} does not exist`);
    }

    const manifestPath = join(versionDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Checkpoint version ${version} has no manifest`);
    }

    await this.ensureStorageDir();

    const pointer: ActivePointer = {
      version,
      activatedAt: new Date().toISOString(),
    };

    const pointerPath = join(this.storageDir, ACTIVE_POINTER_FILE);
    await fs.writeFile(pointerPath, JSON.stringify(pointer, null, 2), 'utf-8');
  }

  async remove(version: string): Promise<void> {
    // Check if this is the active version
    const active = await this.getActive();
    if (active?.version === version) {
      throw new Error(`Cannot remove active checkpoint version ${version}. Rollback to a different version first.`);
    }

    const versionDir = this.versionDir(version);
    if (!existsSync(versionDir)) {
      throw new Error(`Checkpoint version ${version} does not exist`);
    }

    await fs.rm(versionDir, { recursive: true, force: true });
  }

  async pruneOld(): Promise<void> {
    if (this.maxCheckpoints <= 0) return;

    const manifests = await this.listVersions();
    if (manifests.length <= this.maxCheckpoints) return;

    const active = await this.getActive();
    const toRemove = manifests.slice(this.maxCheckpoints);

    for (const manifest of toRemove) {
      // Never remove the active version
      if (active?.version === manifest.version) continue;

      try {
        const versionDir = this.versionDir(manifest.version);
        await fs.rm(versionDir, { recursive: true, force: true });
      } catch {
        // Ignore removal failures during pruning
      }
    }
  }

  private normalizeManifest(manifest: Partial<CheckpointManifest>): CheckpointManifest {
    const normalizedAssets = (manifest.assets ?? []).map((asset) => ({
      ...asset,
      contentHash: asset.contentHash ?? asset.hash,
      contentSize: asset.contentSize ?? asset.size,
      blobPath: asset.blobPath ?? asset.storedPath,
      blobHash: asset.blobHash,
      blobSize: asset.blobSize,
      codec: inferLegacyAssetCodec(asset),
    }));

    return {
      formatVersion: manifest.formatVersion ?? CHECKPOINT_FORMAT_VERSION,
      version: manifest.version ?? 'unknown',
      createdAt: manifest.createdAt ?? new Date(0).toISOString(),
      entrypoint: manifest.entrypoint ?? 'checkpoint.js',
      routes: manifest.routes ?? [],
      assets: normalizedAssets,
      bundleHash: manifest.bundleHash ?? '',
      bundleSize: manifest.bundleSize ?? 0,
      checkpointArchivePath: manifest.checkpointArchivePath,
      checkpointArchiveHash: manifest.checkpointArchiveHash,
      checkpointArchiveSize: manifest.checkpointArchiveSize,
      checkpointArchiveCodec: manifest.checkpointArchiveCodec,
    };
  }
}
