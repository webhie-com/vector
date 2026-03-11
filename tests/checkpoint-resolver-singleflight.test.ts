import { describe, expect, it } from 'bun:test';
import { CheckpointResolver } from '../src/checkpoint/resolver';
import type { CheckpointManifest } from '../src/checkpoint/types';

describe('CheckpointResolver single-flight', () => {
  it('deduplicates concurrent cold-start resolve calls for the same version', async () => {
    const version = '1.0.0';
    const socketPath = `/tmp/vector-checkpoint-${version}.sock`;

    let readManifestCalls = 0;
    let spawnCalls = 0;
    let markUsedCalls = 0;

    const manifest: CheckpointManifest = {
      formatVersion: 1,
      version,
      createdAt: new Date().toISOString(),
      entrypoint: 'checkpoint.js',
      routes: [],
      assets: [],
      bundleHash: 'hash',
      bundleSize: 1,
    };

    const running = new Map<string, { socketPath: string }>();

    const manager = {
      async readManifest(requestedVersion: string) {
        readManifestCalls += 1;
        await Bun.sleep(15);
        if (requestedVersion !== version) {
          throw new Error('unknown');
        }
        return manifest;
      },
      getStorageDir() {
        return '/tmp';
      },
    } as any;

    const processManager = {
      getRunning(requestedVersion: string) {
        return running.get(requestedVersion);
      },
      async spawn(requestedManifest: CheckpointManifest) {
        spawnCalls += 1;
        await Bun.sleep(25);
        const spawned = {
          version: requestedManifest.version,
          socketPath,
          process: {} as any,
          pid: 1234,
        };
        running.set(requestedManifest.version, spawned);
        return spawned;
      },
      markUsed(requestedVersion: string) {
        if (requestedVersion === version) {
          markUsedCalls += 1;
        }
      },
    } as any;

    const resolver = new CheckpointResolver(manager, processManager);

    const request = new Request('http://localhost/test', {
      headers: {
        'x-vector-checkpoint-version': version,
      },
    });

    const concurrent = 30;
    const results = await Promise.all(Array.from({ length: concurrent }, () => resolver.resolve(request)));

    expect(results.every((result) => result === socketPath)).toBe(true);
    expect(readManifestCalls).toBe(1);
    expect(spawnCalls).toBe(1);
    expect(markUsedCalls).toBe(concurrent);
  });
});
