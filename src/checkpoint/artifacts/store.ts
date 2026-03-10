import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CheckpointAssetRecord, CheckpointCompressionCodec } from '../types';
import { compressBytes, DEFAULT_ASSET_CODEC } from './compressor';
import { sha256Hex } from './hasher';
import { normalizeLogicalPath, normalizeRelativePath } from './manifest';
import type { CheckpointArtifactStoreOptions } from './types';

const BLOB_DIR = '_assets/blobs';

export class CheckpointArtifactStore {
  private storageDir: string;
  private codec: CheckpointCompressionCodec;

  constructor(storageDir: string, options: CheckpointArtifactStoreOptions = {}) {
    this.storageDir = storageDir;
    this.codec = options.assetCodec ?? DEFAULT_ASSET_CODEC;
  }

  async addEmbedded(logicalPath: string, sourcePath: string): Promise<CheckpointAssetRecord> {
    return this.addAsset('embedded', logicalPath, sourcePath);
  }

  async addSidecar(logicalPath: string, sourcePath: string): Promise<CheckpointAssetRecord> {
    return this.addAsset('sidecar', logicalPath, sourcePath);
  }

  async collect(embeddedPaths: string[], sidecarPaths: string[]): Promise<CheckpointAssetRecord[]> {
    const records: CheckpointAssetRecord[] = [];

    for (const sourcePath of embeddedPaths) {
      records.push(await this.addEmbedded(sourcePath, sourcePath));
    }

    for (const sourcePath of sidecarPaths) {
      records.push(await this.addSidecar(sourcePath, sourcePath));
    }

    return records;
  }

  private async addAsset(
    type: CheckpointAssetRecord['type'],
    logicalPath: string,
    sourcePath: string
  ): Promise<CheckpointAssetRecord> {
    const content = await fs.readFile(sourcePath);
    const contentBytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    const contentHash = sha256Hex(contentBytes);
    const compressed = compressBytes(contentBytes, this.codec);
    const blobHash = sha256Hex(compressed);
    const blobPath = normalizeRelativePath(join(BLOB_DIR, `${blobHash}${this.codec === 'gzip' ? '.gz' : ''}`));
    const storedPath = join(this.storageDir, blobPath);

    await fs.mkdir(join(this.storageDir, BLOB_DIR), { recursive: true });
    if (!existsSync(storedPath)) {
      await this.writeAtomically(storedPath, compressed);
    } else {
      const existing = await fs.readFile(storedPath);
      const existingBytes = new Uint8Array(existing.buffer, existing.byteOffset, existing.byteLength);
      if (sha256Hex(existingBytes) !== blobHash) {
        await this.writeAtomically(storedPath, compressed);
      }
    }

    return {
      type,
      logicalPath: normalizeLogicalPath(logicalPath),
      storedPath,
      hash: contentHash,
      size: content.byteLength,
      contentHash,
      contentSize: content.byteLength,
      blobHash,
      blobSize: compressed.byteLength,
      blobPath,
      codec: this.codec,
    };
  }

  private async writeAtomically(path: string, bytes: Uint8Array): Promise<void> {
    const tempPath = `${path}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tempPath, bytes);
    try {
      await fs.rename(tempPath, path);
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
      await fs.rm(path, { force: true });
      await fs.rename(tempPath, path);
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === 'EEXIST' || code === 'EPERM';
}
