import { existsSync, promises as fs, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CheckpointManifest } from './types';
import { waitForReady } from './ipc';
import { CheckpointArtifactMaterializer } from './artifacts/materializer';
import { resolveCheckpointSocketPath } from './socket-path';

export interface SpawnedCheckpoint {
  version: string;
  socketPath: string;
  process: ReturnType<typeof Bun.spawn>;
  pid: number;
}

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const STOP_TIMEOUT_MS = 5_000;

export interface CheckpointProcessManagerOptions {
  readyTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export class CheckpointProcessManager {
  private running: Map<string, SpawnedCheckpoint> = new Map();
  private pending: Map<string, Promise<SpawnedCheckpoint>> = new Map();
  private readyTimeoutMs: number;
  private idleTimeoutMs: number;
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastUsedAt: Map<string, number> = new Map();
  private materializer: CheckpointArtifactMaterializer;

  constructor(options: number | CheckpointProcessManagerOptions = DEFAULT_READY_TIMEOUT_MS) {
    if (typeof options === 'number') {
      this.readyTimeoutMs = options;
      this.idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
    } else {
      this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
      this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    }

    this.materializer = new CheckpointArtifactMaterializer();
  }

  async spawn(manifest: CheckpointManifest, storageDir: string): Promise<SpawnedCheckpoint> {
    // Return already-running checkpoint
    if (this.running.has(manifest.version)) {
      return this.running.get(manifest.version)!;
    }

    // Return in-flight spawn to prevent duplicate processes for same version
    if (this.pending.has(manifest.version)) {
      return this.pending.get(manifest.version)!;
    }

    const promise = this.doSpawn(manifest, storageDir);
    this.pending.set(manifest.version, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pending.delete(manifest.version);
    }
  }

  private async doSpawn(manifest: CheckpointManifest, storageDir: string): Promise<SpawnedCheckpoint> {
    const versionDir = join(storageDir, manifest.version);
    const bundlePath = join(versionDir, manifest.entrypoint);
    const socketPath = resolveCheckpointSocketPath(storageDir, manifest.version);

    if (!existsSync(bundlePath)) {
      throw new Error(`Checkpoint bundle not found: ${bundlePath}`);
    }

    // Materialize declared assets into the checkpoint version directory before boot.
    await this.materializer.materialize(manifest, storageDir);

    // Ensure socket parent exists when fallback roots are used.
    await fs.mkdir(dirname(socketPath), { recursive: true });

    // Clean up stale socket file if it exists
    this.tryUnlinkSocket(socketPath);

    const proc = Bun.spawn(['bun', 'run', bundlePath], {
      env: {
        ...process.env,
        VECTOR_CHECKPOINT_SOCKET: socketPath,
        VECTOR_CHECKPOINT_VERSION: manifest.version,
      },
      stdout: 'pipe',
      stderr: 'inherit',
    });

    // Guard against null stdout (shouldn't happen with stdout: 'pipe' but be safe)
    if (!proc.stdout) {
      proc.kill('SIGTERM');
      throw new Error(`Checkpoint process for ${manifest.version} did not provide stdout`);
    }

    try {
      await waitForReady(proc.stdout as ReadableStream<Uint8Array>, this.readyTimeoutMs);
    } catch (err) {
      proc.kill('SIGTERM');
      throw err;
    }

    const spawned: SpawnedCheckpoint = {
      version: manifest.version,
      socketPath,
      process: proc,
      pid: proc.pid,
    };

    this.running.set(manifest.version, spawned);
    this.lastUsedAt.set(manifest.version, Date.now());
    this.scheduleIdleCheck(manifest.version);
    return spawned;
  }

  markUsed(version: string): void {
    if (!this.running.has(version)) {
      return;
    }
    this.lastUsedAt.set(version, Date.now());
  }

  async stop(version: string): Promise<void> {
    const snap = this.running.get(version);
    if (!snap) return;

    this.running.delete(version);
    this.clearIdleTimer(version);
    this.lastUsedAt.delete(version);

    snap.process.kill('SIGTERM');

    // Wait for exit with a timeout
    const exited = await Promise.race([
      snap.process.exited.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), STOP_TIMEOUT_MS)),
    ]);

    // Force kill if SIGTERM didn't work
    if (!exited) {
      try {
        snap.process.kill('SIGKILL');
        await snap.process.exited;
      } catch {
        // Process may have already exited between the check and SIGKILL
      }
    }

    this.tryUnlinkSocket(snap.socketPath);
  }

  async stopAll(): Promise<void> {
    const versions = [...this.running.keys()];
    for (const version of versions) {
      await this.stop(version);
    }
  }

  isRunning(version: string): boolean {
    return this.running.has(version);
  }

  getRunning(version: string): SpawnedCheckpoint | undefined {
    return this.running.get(version);
  }

  async health(version: string): Promise<boolean> {
    const snap = this.running.get(version);
    if (!snap) return false;

    try {
      const response = await fetch('http://localhost/_vector/health', {
        unix: snap.socketPath,
        signal: AbortSignal.timeout(2000),
      } as any);
      return response.ok;
    } catch {
      return false;
    }
  }

  getRunningVersions(): string[] {
    return [...this.running.keys()];
  }

  private scheduleIdleCheck(version: string, delayMs = this.idleTimeoutMs): void {
    this.clearIdleTimer(version);
    if (this.idleTimeoutMs <= 0) {
      return;
    }

    const timer = setTimeout(
      () => {
        void this.handleIdleCheck(version);
      },
      Math.max(1, delayMs)
    );

    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }

    this.idleTimers.set(version, timer);
  }

  private async handleIdleCheck(version: string): Promise<void> {
    if (!this.running.has(version)) {
      return;
    }

    const lastUsedAt = this.lastUsedAt.get(version) ?? 0;
    const idleForMs = Date.now() - lastUsedAt;
    const remainingMs = this.idleTimeoutMs - idleForMs;

    if (remainingMs > 0) {
      this.scheduleIdleCheck(version, remainingMs);
      return;
    }

    try {
      await this.stop(version);
    } catch (error) {
      console.error(`[CheckpointProcessManager] Failed to stop idle checkpoint ${version}:`, error);
    }
  }

  private clearIdleTimer(version: string): void {
    const timer = this.idleTimers.get(version);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.idleTimers.delete(version);
  }

  private tryUnlinkSocket(socketPath: string): void {
    try {
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    } catch {
      // Ignore cleanup failures
    }
  }
}
