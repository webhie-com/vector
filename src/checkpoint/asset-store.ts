import { promises as fs } from 'node:fs';
import type { CheckpointAssetRecord } from './types';
import { CheckpointArtifactStore } from './artifacts/store';

const EMBEDDED_PER_FILE_BUDGET = 64 * 1024; // 64 KB per file
const EMBEDDED_TOTAL_BUDGET = 512 * 1024; // 512 KB total

export class AssetStore {
  private artifactStore: CheckpointArtifactStore;

  constructor(storageDir: string) {
    this.artifactStore = new CheckpointArtifactStore(storageDir);
  }

  async addEmbedded(logicalPath: string, sourcePath: string): Promise<CheckpointAssetRecord> {
    const content = await fs.readFile(sourcePath);
    if (content.byteLength > EMBEDDED_PER_FILE_BUDGET) {
      throw new Error(
        `Embedded asset "${logicalPath}" is ${formatBytes(content.byteLength)} — exceeds ${formatBytes(EMBEDDED_PER_FILE_BUDGET)} per-file budget. Use sidecar instead.`
      );
    }

    return await this.artifactStore.addEmbedded(logicalPath, sourcePath);
  }

  async addSidecar(logicalPath: string, sourcePath: string): Promise<CheckpointAssetRecord> {
    return await this.artifactStore.addSidecar(logicalPath, sourcePath);
  }

  async collect(embeddedPaths: string[], sidecarPaths: string[]): Promise<CheckpointAssetRecord[]> {
    const records: CheckpointAssetRecord[] = [];

    for (const p of embeddedPaths) {
      records.push(await this.addEmbedded(p, p));
    }

    for (const p of sidecarPaths) {
      records.push(await this.addSidecar(p, p));
    }

    return records;
  }

  validateBudgets(records: CheckpointAssetRecord[]): void {
    const embeddedTotal = records
      .filter((r) => r.type === 'embedded')
      .reduce((acc, r) => acc + (r.contentSize ?? r.size), 0);

    if (embeddedTotal > EMBEDDED_TOTAL_BUDGET) {
      throw new Error(
        `Total embedded asset size ${formatBytes(embeddedTotal)} exceeds ${formatBytes(EMBEDDED_TOTAL_BUDGET)} budget.`
      );
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
