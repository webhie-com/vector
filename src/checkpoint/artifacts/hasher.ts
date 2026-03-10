export function sha256Hex(content: Uint8Array | ArrayBuffer): string {
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const hashBuffer = Bun.SHA256.hash(bytes);
  const hashBytes = new Uint8Array(hashBuffer.buffer, hashBuffer.byteOffset, hashBuffer.byteLength);
  return Buffer.from(hashBytes).toString('hex');
}
