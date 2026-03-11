export const CHECKPOINT_FORMAT_VERSION = 1;

export type CheckpointCompressionCodec = 'none' | 'gzip';

export interface CheckpointManifest {
  formatVersion: number;
  version: string;
  createdAt: string;
  entrypoint: string;
  routes: CheckpointRouteRecord[];
  assets: CheckpointAssetRecord[];
  bundleHash: string;
  bundleSize: number;
  checkpointArchivePath?: string;
  checkpointArchiveHash?: string;
  checkpointArchiveSize?: number;
  checkpointArchiveCodec?: CheckpointCompressionCodec;
}

export interface CheckpointRouteRecord {
  method: string;
  path: string;
  metadata?: Record<string, unknown>;
}

export interface CheckpointAssetRecord {
  type: 'embedded' | 'sidecar';
  logicalPath: string;
  // Legacy field kept for compatibility with existing tests/fixtures.
  storedPath: string;
  // Legacy field kept for compatibility with existing tests/fixtures.
  hash: string;
  // Legacy field kept for compatibility with existing tests/fixtures.
  size: number;
  contentHash?: string;
  contentSize?: number;
  blobHash?: string;
  blobSize?: number;
  blobPath?: string;
  codec?: CheckpointCompressionCodec;
  materializedPath?: string;
}

export interface CheckpointConfig {
  enabled?: boolean;
  storageDir?: string;
  maxCheckpoints?: number;
  versionHeader?: string;
  idleTimeoutMs?: number;
  cacheKeyOverride?: boolean;
}

export interface CheckpointPublishOptions {
  version: string;
  routesDir: string;
  embeddedAssetPaths?: string[];
  sidecarAssetPaths?: string[];
}

export interface ActivePointer {
  version: string;
  activatedAt: string;
}
