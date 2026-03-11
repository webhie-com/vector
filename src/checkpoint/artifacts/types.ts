import type { CheckpointAssetRecord, CheckpointCompressionCodec } from '../types';

export interface CheckpointArtifactStoreOptions {
  assetCodec?: CheckpointCompressionCodec;
}

export interface CheckpointArtifactMaterializerOptions {
  verifyChecksums?: boolean;
  materializedDirName?: string;
  lockTimeoutMs?: number;
}

export interface CheckpointArtifactPackageRecord {
  archivePath: string;
  archiveHash: string;
  archiveSize: number;
  codec: CheckpointCompressionCodec;
}

export interface CheckpointArtifactRepository {
  writeBlob(record: CheckpointAssetRecord, bytes: Uint8Array): Promise<void>;
  hasBlob(record: CheckpointAssetRecord): Promise<boolean>;
  readBlob(record: CheckpointAssetRecord): Promise<Uint8Array>;
}
