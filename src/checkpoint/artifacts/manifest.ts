import { basename, isAbsolute, relative } from 'node:path';
import type { CheckpointAssetRecord } from '../types';

const UNSAFE_SEGMENT_PATTERN = /[^a-zA-Z0-9._/-]/g;
const WINDOWS_DRIVE_ABS_PATTERN = /^[a-zA-Z]:[\\/]/;
const WINDOWS_UNC_ABS_PATTERN = /^\\\\[^\\]+\\[^\\]+/;

export function normalizeLogicalPath(input: string): string {
  const normalizedInput = normalizeSlashes(input).trim();
  const rel = isAbsolutePathPortable(normalizedInput) ? toPortableRelativePath(normalizedInput) : normalizedInput;

  const cleaned = rel
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/');

  const sanitized = cleaned.replace(UNSAFE_SEGMENT_PATTERN, '_').replace(/^\/+/, '');
  if (sanitized.length > 0) {
    return sanitized;
  }

  const fallback = basename(normalizedInput).replace(UNSAFE_SEGMENT_PATTERN, '_');
  return fallback.length > 0 ? `external/${fallback}` : 'external/asset.bin';
}

export function normalizeRelativePath(input: string): string {
  return normalizeSlashes(input).replace(/^\/+/, '');
}

export function isAbsolutePathPortable(input: string): boolean {
  const normalized = normalizeSlashes(input).trim();
  return isAbsolute(normalized) || WINDOWS_DRIVE_ABS_PATTERN.test(normalized) || WINDOWS_UNC_ABS_PATTERN.test(input);
}

export function computeAssetFingerprint(assets: CheckpointAssetRecord[]): string {
  const stable = assets
    .map((asset) => ({
      type: asset.type,
      logicalPath: asset.logicalPath,
      contentHash: asset.contentHash ?? asset.hash,
      blobHash: asset.blobHash ?? '',
      blobPath: asset.blobPath ?? asset.storedPath,
      codec: asset.codec ?? 'none',
      size: asset.contentSize ?? asset.size,
    }))
    .sort((a, b) =>
      `${a.type}:${a.logicalPath}:${a.contentHash}:${a.blobHash}`.localeCompare(
        `${b.type}:${b.logicalPath}:${b.contentHash}:${b.blobHash}`
      )
    );

  return JSON.stringify(stable);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function toPortableRelativePath(input: string): string {
  const normalized = normalizeSlashes(input);
  if (WINDOWS_DRIVE_ABS_PATTERN.test(normalized)) {
    return normalized.replace(/^[a-zA-Z]:/, '').replace(/^\/+/, '');
  }

  if (WINDOWS_UNC_ABS_PATTERN.test(input)) {
    return normalizeSlashes(input)
      .replace(/^\\\\[^\\]+\\[^\\]+/, '')
      .replace(/^\/+/, '');
  }

  return normalizeSlashes(relative(process.cwd(), normalized));
}
