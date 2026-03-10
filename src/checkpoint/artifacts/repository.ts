import { existsSync, promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CheckpointAssetRecord } from '../types';
import type { CheckpointArtifactRepository } from './types';

export class LocalCheckpointArtifactRepository implements CheckpointArtifactRepository {
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  async writeBlob(record: CheckpointAssetRecord, bytes: Uint8Array): Promise<void> {
    const targetPath = this.resolveBlobPath(record);
    await fs.mkdir(dirname(targetPath), { recursive: true });
    if (existsSync(targetPath)) {
      return;
    }
    await fs.writeFile(targetPath, bytes);
  }

  async hasBlob(record: CheckpointAssetRecord): Promise<boolean> {
    return existsSync(this.resolveBlobPath(record));
  }

  async readBlob(record: CheckpointAssetRecord): Promise<Uint8Array> {
    const targetPath = this.resolveBlobPath(record);
    const bytes = await fs.readFile(targetPath);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  resolveBlobPath(record: CheckpointAssetRecord): string {
    const rawPath = record.blobPath ?? record.storedPath;
    return rawPath.startsWith('/') ? rawPath : join(this.storageDir, rawPath);
  }
}
