import type { CheckpointCompressionCodec } from '../types';

interface DecompressWorkerRequest {
  id: number;
  codec: CheckpointCompressionCodec;
  input: ArrayBuffer;
}

interface DecompressWorkerResponse {
  id: number;
  output?: ArrayBuffer;
  error?: string;
}

const worker = globalThis as unknown as Worker;

worker.onmessage = (event: MessageEvent<DecompressWorkerRequest>) => {
  const request = event.data;
  const response: DecompressWorkerResponse = { id: request.id };

  try {
    const input = new Uint8Array(request.input);
    const output = decompressInWorker(input, request.codec);
    const outputBuffer = toArrayBuffer(output);
    response.output = outputBuffer;
    worker.postMessage(response, [outputBuffer]);
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
    worker.postMessage(response);
  }
};

function decompressInWorker(
  input: Uint8Array<ArrayBuffer>,
  codec: CheckpointCompressionCodec
): Uint8Array<ArrayBufferLike> {
  switch (codec) {
    case 'none':
      return input;
    case 'gzip':
      return Bun.gunzipSync(input);
    default:
      throw new Error(`Unsupported compression codec: ${codec}`);
  }
}

function toArrayBuffer(input: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  return new Uint8Array(input).buffer;
}
