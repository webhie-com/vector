import { existsSync, promises as fs } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import type { CheckpointAssetRecord, CheckpointManifest } from '../types';
import { sha256Hex } from './hasher';
import { computeAssetFingerprint, isAbsolutePathPortable, normalizeLogicalPath } from './manifest';
import type { CheckpointArtifactMaterializerOptions } from './types';
import { CheckpointWorkerDecompressor } from './worker-decompressor';

const DEFAULT_MATERIALIZED_DIR = '_materialized';
const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_POLL_MS = 50;

interface MaterializedMarker {
  fingerprint: string;
  createdAt: string;
}

export class CheckpointArtifactMaterializer {
  private verifyChecksums: boolean;
  private materializedDirName: string;
  private lockTimeoutMs: number;

  constructor(options: CheckpointArtifactMaterializerOptions = {}) {
    this.verifyChecksums = options.verifyChecksums ?? true;
    this.materializedDirName = options.materializedDirName ?? DEFAULT_MATERIALIZED_DIR;
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  }

  async materialize(manifest: CheckpointManifest, storageDir: string): Promise<void> {
    const versionDir = join(storageDir, manifest.version);
    const markerPath = join(versionDir, '.assets.ready.json');
    const lockPath = join(versionDir, '.assets.lock');
    const fingerprint = computeAssetFingerprint(manifest.assets);

    if (await this.isReady(markerPath, fingerprint, manifest.assets, join(versionDir, this.materializedDirName))) {
      return;
    }

    await this.acquireLock(lockPath);
    try {
      if (await this.isReady(markerPath, fingerprint, manifest.assets, join(versionDir, this.materializedDirName))) {
        return;
      }

      const materializedRoot = join(versionDir, this.materializedDirName);
      await fs.rm(materializedRoot, { recursive: true, force: true });
      await fs.mkdir(materializedRoot, { recursive: true });

      const decompressor = new CheckpointWorkerDecompressor();
      try {
        for (const asset of manifest.assets) {
          const result = await this.materializeAsset(asset, storageDir, versionDir, materializedRoot, decompressor);
          asset.materializedPath = result;
        }
      } finally {
        await decompressor.dispose();
      }

      const marker: MaterializedMarker = {
        fingerprint,
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  }

  private async materializeAsset(
    asset: CheckpointAssetRecord,
    storageDir: string,
    versionDir: string,
    root: string,
    decompressor: CheckpointWorkerDecompressor
  ): Promise<string> {
    const sourcePath = this.resolveSourcePath(asset, storageDir);
    if (!existsSync(sourcePath)) {
      throw new Error(`Checkpoint asset blob not found: ${sourcePath}`);
    }

    const blob = await fs.readFile(sourcePath);
    const blobBytes = new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
    const expectedBlobHash = asset.blobHash;
    if (this.verifyChecksums && expectedBlobHash && sha256Hex(blobBytes) !== expectedBlobHash) {
      throw new Error(`Checkpoint asset blob checksum mismatch for ${asset.logicalPath}`);
    }

    const codec = asset.codec ?? (asset.blobHash ? 'gzip' : 'none');
    const contentBytes = await decompressor.decompress(blobBytes, codec);
    const expectedContentHash = asset.contentHash ?? asset.hash;
    if (this.verifyChecksums && expectedContentHash && sha256Hex(contentBytes) !== expectedContentHash) {
      throw new Error(`Checkpoint asset content checksum mismatch for ${asset.logicalPath}`);
    }

    const cachedFile = await this.writeDecompressedCache(asset, storageDir, contentBytes);
    const safeLogicalPath = normalizeLogicalPath(asset.logicalPath);
    const destinationPath = join(root, safeLogicalPath);
    await fs.mkdir(dirname(destinationPath), { recursive: true });
    await fs.rm(destinationPath, { force: true });
    await this.linkWithFallback(cachedFile, destinationPath);

    return normalizePath(relative(versionDir, destinationPath));
  }

  private async writeDecompressedCache(
    asset: CheckpointAssetRecord,
    storageDir: string,
    bytes: Uint8Array
  ): Promise<string> {
    const hash = asset.contentHash ?? asset.hash;
    const extension = extname(asset.logicalPath) || '.bin';
    const cacheFile = join(storageDir, '_assets/cache', `${hash}${extension}`);
    await fs.mkdir(dirname(cacheFile), { recursive: true });
    if (existsSync(cacheFile)) {
      if (!this.verifyChecksums) {
        return cacheFile;
      }
      const existing = await fs.readFile(cacheFile);
      const existingBytes = new Uint8Array(existing.buffer, existing.byteOffset, existing.byteLength);
      if (sha256Hex(existingBytes) === hash) {
        return cacheFile;
      }
    }
    await fs.writeFile(cacheFile, bytes);
    return cacheFile;
  }

  private resolveSourcePath(asset: CheckpointAssetRecord, storageDir: string): string {
    const rawPath = asset.blobPath ?? asset.storedPath;
    if (isAbsolutePathPortable(rawPath)) {
      return rawPath;
    }
    return join(storageDir, rawPath);
  }

  private async linkWithFallback(sourcePath: string, destinationPath: string): Promise<void> {
    try {
      await fs.link(sourcePath, destinationPath);
      return;
    } catch {
      // Fall through to symlink/copy.
    }

    try {
      await fs.symlink(sourcePath, destinationPath);
      return;
    } catch {
      // Fall through to copy.
    }

    await fs.copyFile(sourcePath, destinationPath);
  }

  private async acquireLock(lockPath: string): Promise<void> {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (Date.now() < deadline) {
      try {
        await fs.mkdir(lockPath);
        return;
      } catch (error) {
        if (!isAlreadyExists(error)) {
          throw error;
        }
      }
      await sleep(DEFAULT_LOCK_POLL_MS);
    }

    throw new Error(`Timed out waiting for checkpoint asset lock: ${lockPath}`);
  }

  private async isReady(
    markerPath: string,
    fingerprint: string,
    assets: CheckpointAssetRecord[],
    materializedRoot: string
  ): Promise<boolean> {
    if (!existsSync(markerPath)) {
      return false;
    }

    try {
      const marker = JSON.parse(await fs.readFile(markerPath, 'utf-8')) as MaterializedMarker;
      if (marker.fingerprint !== fingerprint) {
        return false;
      }
      for (const asset of assets) {
        const expectedPath = join(materializedRoot, normalizeLogicalPath(asset.logicalPath));
        if (!existsSync(expectedPath)) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'EEXIST'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
