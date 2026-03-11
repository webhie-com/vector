import type { CheckpointManager } from './manager';
import type { CheckpointProcessManager } from './process-manager';

const DEFAULT_VERSION_HEADER = 'x-vector-checkpoint-version';
const FALLBACK_VERSION_HEADER = 'x-vector-checkpoint';

export interface CheckpointResolverOptions {
  versionHeader?: string;
  cacheKeyOverride?: boolean;
}

export class CheckpointResolver {
  private manager: CheckpointManager;
  private processManager: CheckpointProcessManager;
  private versionHeader: string;
  private cacheKeyOverride: boolean;
  private allowFallbackVersionHeader: boolean;
  private pendingVersionResolves: Map<string, Promise<string | null>> = new Map();

  constructor(
    manager: CheckpointManager,
    processManager: CheckpointProcessManager,
    options: CheckpointResolverOptions = {}
  ) {
    this.manager = manager;
    this.processManager = processManager;
    this.versionHeader = normalizeHeaderName(options.versionHeader ?? DEFAULT_VERSION_HEADER);
    this.cacheKeyOverride = options.cacheKeyOverride === true;
    this.allowFallbackVersionHeader = options.versionHeader === undefined;
  }

  async resolve(request: Request): Promise<string | null> {
    const requestedVersion = this.getRequestedVersion(request);
    if (!requestedVersion) {
      return null;
    }
    return await this.resolveVersion(requestedVersion);
  }

  getRequestedVersion(request: Request): string | null {
    return this.getRequestedHeader(request)?.value ?? null;
  }

  getCacheKeyOverrideValue(request: Request): string | null {
    if (!this.cacheKeyOverride) {
      return null;
    }

    const requestedHeader = this.getRequestedHeader(request);
    if (!requestedHeader) {
      return null;
    }

    return `${requestedHeader.name}:${requestedHeader.value}`;
  }

  private getRequestedHeader(request: Request): { name: string; value: string } | null {
    const primary = request.headers.get(this.versionHeader);
    if (primary && primary.trim().length > 0) {
      return { name: this.versionHeader, value: primary.trim() };
    }

    if (this.allowFallbackVersionHeader && this.versionHeader !== FALLBACK_VERSION_HEADER) {
      const fallback = request.headers.get(FALLBACK_VERSION_HEADER);
      if (fallback && fallback.trim().length > 0) {
        return { name: FALLBACK_VERSION_HEADER, value: fallback.trim() };
      }
    }

    return null;
  }

  private async resolveVersion(version: string): Promise<string | null> {
    let running = this.processManager.getRunning(version);
    if (!running) {
      const pending = this.pendingVersionResolves.get(version);
      if (pending) {
        const socketPath = await pending;
        if (!socketPath) {
          return null;
        }

        this.processManager.markUsed(version);
        return socketPath;
      }

      const pendingResolve = (async (): Promise<string | null> => {
        try {
          const manifest = await this.manager.readManifest(version);
          const spawned = await this.processManager.spawn(manifest, this.manager.getStorageDir());
          return spawned.socketPath;
        } catch {
          return null;
        }
      })();

      this.pendingVersionResolves.set(version, pendingResolve);
      const socketPath = await pendingResolve;
      this.pendingVersionResolves.delete(version);

      if (!socketPath) {
        return null;
      }

      this.processManager.markUsed(version);
      return socketPath;
    }

    this.processManager.markUsed(version);
    return running.socketPath;
  }

  /**
   * Legacy no-op retained for compatibility with tests and existing integrations.
   */
  invalidateCache(): void {
    // No caching, so nothing to invalidate.
  }
}

function normalizeHeaderName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : DEFAULT_VERSION_HEADER;
}
