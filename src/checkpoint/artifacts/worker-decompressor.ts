import { availableParallelism, cpus } from 'node:os';
import type { CheckpointCompressionCodec } from '../types';

interface DecompressRequest {
  id: number;
  codec: CheckpointCompressionCodec;
  input: ArrayBuffer;
}

interface DecompressResponse {
  id: number;
  output?: ArrayBuffer;
  error?: string;
}

interface DecompressJob {
  id: number;
  request: DecompressRequest;
  resolve: (output: Uint8Array) => void;
  reject: (error: Error) => void;
}

const DEFAULT_MAX_WORKERS = 4;

export class CheckpointWorkerDecompressor {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private queue: DecompressJob[] = [];
  private activeJobsByWorker: Map<Worker, DecompressJob> = new Map();
  private nextJobId = 1;
  private disposed = false;

  constructor(workerCount: number = resolveDefaultWorkerCount()) {
    const normalizedCount = normalizeWorkerCount(workerCount);
    const workerUrl = resolveWorkerModuleUrl();

    for (let i = 0; i < normalizedCount; i++) {
      const worker = new Worker(workerUrl.href);
      worker.onmessage = (event) => this.handleWorkerMessage(worker, event);
      worker.onerror = (event) => this.handleWorkerError(worker, event);
      this.workers.push(worker);
      this.idleWorkers.push(worker);
    }
  }

  async decompress(input: Uint8Array, codec: CheckpointCompressionCodec): Promise<Uint8Array> {
    if (codec === 'none') {
      return new Uint8Array(input);
    }

    if (this.disposed) {
      throw new Error('Checkpoint worker decompressor is disposed');
    }

    const copied = new Uint8Array(input);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const id = this.nextJobId++;
      this.queue.push({
        id,
        request: {
          id,
          codec,
          input: copied.buffer,
        },
        resolve,
        reject,
      });
      this.pump();
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    const error = new Error('Checkpoint worker decompressor disposed');
    this.failAll(error);

    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch {
        // Ignore termination failures.
      }
    }

    this.workers = [];
    this.idleWorkers = [];
    this.activeJobsByWorker.clear();
  }

  private pump(): void {
    while (this.idleWorkers.length > 0 && this.queue.length > 0) {
      const worker = this.idleWorkers.pop()!;
      const job = this.queue.shift()!;
      this.activeJobsByWorker.set(worker, job);
      worker.postMessage(job.request, [job.request.input]);
    }
  }

  private handleWorkerMessage(worker: Worker, event: MessageEvent<DecompressResponse>): void {
    const job = this.activeJobsByWorker.get(worker);
    this.activeJobsByWorker.delete(worker);

    if (!this.disposed) {
      this.idleWorkers.push(worker);
    }

    if (!job) {
      this.pump();
      return;
    }

    const message = event.data;
    if (message.error) {
      job.reject(new Error(message.error));
    } else if (message.output instanceof ArrayBuffer) {
      job.resolve(new Uint8Array(message.output));
    } else {
      job.reject(new Error('Worker returned no output'));
    }

    this.pump();
  }

  private handleWorkerError(worker: Worker, event: ErrorEvent): void {
    const job = this.activeJobsByWorker.get(worker);
    this.activeJobsByWorker.delete(worker);
    this.idleWorkers = this.idleWorkers.filter((candidate) => candidate !== worker);

    const message = event.message?.trim() || 'Checkpoint decompression worker crashed';
    const error = new Error(message);

    if (job) {
      job.reject(error);
    }

    this.failAll(error);
    this.dispose().catch(() => {
      // Ignore cleanup failures after worker error.
    });
  }

  private failAll(error: Error): void {
    const queued = this.queue.splice(0, this.queue.length);
    for (const job of queued) {
      job.reject(error);
    }

    for (const job of this.activeJobsByWorker.values()) {
      job.reject(error);
    }
    this.activeJobsByWorker.clear();
  }
}

function resolveDefaultWorkerCount(): number {
  const cores = resolveCoreCount();
  const reserveForMainThread = Math.max(1, cores - 1);
  return Math.max(1, Math.min(DEFAULT_MAX_WORKERS, reserveForMainThread));
}

function resolveCoreCount(): number {
  try {
    const parallelism = availableParallelism();
    if (Number.isFinite(parallelism) && parallelism > 0) {
      return parallelism;
    }
  } catch {
    // Fall through to cpus().
  }

  const cpuCount = cpus().length;
  return Number.isFinite(cpuCount) && cpuCount > 0 ? cpuCount : 1;
}

function normalizeWorkerCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function resolveWorkerModuleUrl(): URL {
  if (import.meta.url.endsWith('.ts')) {
    return new URL('./decompress-worker.ts', import.meta.url);
  }
  return new URL('./decompress-worker.js', import.meta.url);
}
