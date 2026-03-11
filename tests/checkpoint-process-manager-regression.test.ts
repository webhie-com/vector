import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CheckpointProcessManager } from '../src/checkpoint/process-manager';
import type { CheckpointManifest } from '../src/checkpoint/types';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-process-mgr-regression');
const encoder = new TextEncoder();

async function cleanup(): Promise<void> {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function createManifest(version: string, storageDir = TEST_STORAGE_DIR): Promise<CheckpointManifest> {
  const versionDir = join(storageDir, version);
  await fs.mkdir(versionDir, { recursive: true });
  await fs.writeFile(join(versionDir, 'checkpoint.js'), '// mocked spawn target', 'utf-8');

  return {
    formatVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    entrypoint: 'checkpoint.js',
    routes: [],
    assets: [],
    bundleHash: 'test-hash',
    bundleSize: 0,
  };
}

function createChunkedReadyStdout(chunks: string[], delayMs = 5): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await Bun.sleep(delayMs);
      }
      controller.close();
    },
  });
}

function createMockSpawnProcess(stdout: ReadableStream<Uint8Array>) {
  let resolveExit: ((code: number) => void) | null = null;
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  return {
    pid: 4242,
    stdout,
    stderr: null,
    exited,
    kill() {
      resolveExit?.(0);
    },
  };
}

describe('CheckpointProcessManager regression', () => {
  let processManager: CheckpointProcessManager;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(async () => {
    await cleanup();
    processManager = new CheckpointProcessManager({ readyTimeoutMs: 1000 });
    originalSpawn = Bun.spawn;
  });

  afterEach(async () => {
    (Bun as any).spawn = originalSpawn;
    await processManager.stopAll();
    await cleanup();
  });

  it('spawn succeeds when READY is chunked across stdout segments', async () => {
    const manifest = await createManifest('chunked-ready');
    let spawnCallCount = 0;

    (Bun as any).spawn = () => {
      spawnCallCount += 1;
      return createMockSpawnProcess(createChunkedReadyStdout(['REA', 'DY']));
    };

    const spawned = await processManager.spawn(manifest, TEST_STORAGE_DIR);

    expect(spawned.version).toBe('chunked-ready');
    expect(spawned.pid).toBe(4242);
    expect(spawnCallCount).toBe(1);
    expect(processManager.isRunning('chunked-ready')).toBe(true);
  });

  it('spawn rejects when chunked JSON error arrives before READY', async () => {
    const manifest = await createManifest('chunked-error');
    let spawnCallCount = 0;

    (Bun as any).spawn = () => {
      spawnCallCount += 1;
      return createMockSpawnProcess(createChunkedReadyStdout(['{"type":"error","mes', 'sage":"startup failed"}\n']));
    };

    await expect(processManager.spawn(manifest, TEST_STORAGE_DIR)).rejects.toThrow('startup failed');
    expect(spawnCallCount).toBe(1);
    expect(processManager.isRunning('chunked-error')).toBe(false);
  });

  it('uses a short socket path when the checkpoint storage path is too long', async () => {
    const longStorageDir = join(TEST_STORAGE_DIR, 'a'.repeat(120), 'b'.repeat(120));
    const manifest = await createManifest('long-path', longStorageDir);
    const defaultSocketPath = join(longStorageDir, 'long-path', 'run.sock');
    let socketFromEnv = '';

    (Bun as any).spawn = (_cmd: string[], options: { env?: Record<string, string> }) => {
      socketFromEnv = options.env?.VECTOR_CHECKPOINT_SOCKET ?? '';
      return createMockSpawnProcess(createChunkedReadyStdout(['READY\n']));
    };

    const spawned = await processManager.spawn(manifest, longStorageDir);

    if (process.platform === 'win32') {
      expect(spawned.socketPath).toBe(defaultSocketPath);
      return;
    }

    expect(spawned.socketPath).not.toBe(defaultSocketPath);
    expect(spawned.socketPath).toBe(socketFromEnv);
    expect(Buffer.byteLength(spawned.socketPath, 'utf8')).toBeLessThanOrEqual(103);
  });
});
