import type { CheckpointCompressionCodec } from '../types';

export const DEFAULT_ASSET_CODEC: CheckpointCompressionCodec = 'gzip';

export function compressBytes(input: Uint8Array, codec: CheckpointCompressionCodec = DEFAULT_ASSET_CODEC): Uint8Array {
  const normalized = new Uint8Array(input);
  switch (codec) {
    case 'none':
      return normalized;
    case 'gzip':
      return Bun.gzipSync(normalized);
    default:
      throw new Error(`Unsupported compression codec: ${codec}`);
  }
}

export function decompressBytes(
  input: Uint8Array,
  codec: CheckpointCompressionCodec = DEFAULT_ASSET_CODEC
): Uint8Array {
  const normalized = new Uint8Array(input);
  switch (codec) {
    case 'none':
      return normalized;
    case 'gzip':
      return Bun.gunzipSync(normalized);
    default:
      throw new Error(`Unsupported compression codec: ${codec}`);
  }
}
