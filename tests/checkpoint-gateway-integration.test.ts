import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint/manager';
import { CheckpointProcessManager } from '../src/checkpoint/process-manager';
import { CheckpointResolver } from '../src/checkpoint/resolver';
import { CheckpointForwarder } from '../src/checkpoint/forwarder';
import { CheckpointGateway } from '../src/checkpoint/gateway';
import type { CheckpointManifest } from '../src/checkpoint/types';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-gateway');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function createTestCheckpoint(
  manager: CheckpointManager,
  version: string,
  createdAt: string = new Date().toISOString()
): Promise<CheckpointManifest> {
  const versionDir = manager.versionDir(version);
  await fs.mkdir(versionDir, { recursive: true });

  const checkpointCode = `
const socketPath = process.env.VECTOR_CHECKPOINT_SOCKET;
const server = Bun.serve({
  unix: socketPath,
  routes: {
    '/_vector/health': {
      GET: () => Response.json({ status: 'ok', version: '${version}' }),
    },
    '/api/data': {
      GET: () => Response.json({ source: 'checkpoint', version: '${version}' }),
    },
    '/api/echo': {
      POST: async (req) => {
        const body = await req.json();
        return Response.json({ echo: body, version: '${version}' });
      },
    },
  },
  fetch(req) {
    return Response.json({ error: true, message: 'Not Found' }, { status: 404 });
  },
});
process.stdout.write('READY\\n');
process.on('SIGTERM', () => { server.stop(); process.exit(0); });
`;

  await fs.writeFile(join(versionDir, 'checkpoint.js'), checkpointCode, 'utf-8');

  const manifest: CheckpointManifest = {
    formatVersion: 1,
    version,
    createdAt,
    entrypoint: 'checkpoint.js',
    routes: [
      { method: 'GET', path: '/api/data' },
      { method: 'POST', path: '/api/echo' },
    ],
    assets: [],
    bundleHash: 'test-hash',
    bundleSize: checkpointCode.length,
  };

  await fs.writeFile(join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

describe('CheckpointGateway Integration', () => {
  let manager: CheckpointManager;
  let processManager: CheckpointProcessManager;
  let resolver: CheckpointResolver;
  let gateway: CheckpointGateway;

  beforeEach(async () => {
    await cleanup();
    manager = new CheckpointManager({ storageDir: TEST_STORAGE_DIR });
    processManager = new CheckpointProcessManager({ readyTimeoutMs: 5000, idleTimeoutMs: 60_000 });
    resolver = new CheckpointResolver(manager, processManager);
    const forwarder = new CheckpointForwarder();
    gateway = new CheckpointGateway(resolver, forwarder);
  });

  afterEach(async () => {
    await processManager.stopAll();
    await cleanup();
  });

  it('returns null when no checkpoints are available', async () => {
    const result = await gateway.handle(new Request('http://localhost/api/data'));
    expect(result).toBeNull();
  });

  it('passes context payload through to forwarder', async () => {
    const fakeResolver = {
      resolve: async () => '/tmp/fake.sock',
      getRequestedVersion: () => '1.0.0',
      getCacheKeyOverrideValue: () => null,
    };
    let capturedPayload: Record<string, unknown> | undefined;
    const fakeForwarder = {
      forward: async (_request: Request, _socketPath: string, payload?: Record<string, unknown>) => {
        capturedPayload = payload;
        return new Response('ok', { status: 200 });
      },
    };

    const testGateway = new CheckpointGateway(fakeResolver as any, fakeForwarder as any);
    const response = await testGateway.handle(
      new Request('http://localhost/api/data', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      }),
      { traceId: 'trace-123' }
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    expect(capturedPayload).toEqual({ traceId: 'trace-123' });
  });

  it('forwards request to requested checkpoint and auto-spawns if needed', async () => {
    await createTestCheckpoint(manager, '1.0.0');
    const response = await gateway.handle(
      new Request('http://localhost/api/data', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(body.source).toBe('checkpoint');
    expect(body.version).toBe('1.0.0');
  });

  it('forwards POST request with body to selected version', async () => {
    await createTestCheckpoint(manager, '2.0.0');

    const response = await gateway.handle(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vector-checkpoint-version': '2.0.0',
        },
        body: JSON.stringify({ hello: 'world' }),
      })
    );

    expect(response).not.toBeNull();
    const body = await response!.json();
    expect(body.echo).toEqual({ hello: 'world' });
    expect(body.version).toBe('2.0.0');
  });

  it('routes different requests to different versions using header gating', async () => {
    await createTestCheckpoint(manager, '1.0.0');
    await createTestCheckpoint(manager, '2.0.0');

    const response1 = await gateway.handle(
      new Request('http://localhost/api/data', {
        headers: { 'x-vector-checkpoint-version': '1.0.0' },
      })
    );
    const body1 = await response1!.json();
    expect(body1.version).toBe('1.0.0');

    const response2 = await gateway.handle(
      new Request('http://localhost/api/data', {
        headers: { 'x-vector-checkpoint-version': '2.0.0' },
      })
    );
    const body2 = await response2!.json();
    expect(body2.version).toBe('2.0.0');

    expect(processManager.getRunningVersions()).toContain('1.0.0');
    expect(processManager.getRunningVersions()).toContain('2.0.0');
  });

  it('returns null when no version header is provided', async () => {
    await createTestCheckpoint(manager, '1.0.0', '2026-01-01T00:00:00.000Z');
    await createTestCheckpoint(manager, '3.0.0', '2026-03-01T00:00:00.000Z');

    const response = await gateway.handle(new Request('http://localhost/api/data'));
    expect(response).toBeNull();
  });

  it('returns 503 when requested header version does not exist', async () => {
    await createTestCheckpoint(manager, '1.0.0');

    const response = await gateway.handle(
      new Request('http://localhost/api/data', {
        headers: { 'x-vector-checkpoint-version': '9.9.9' },
      })
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(503);
    const body = await response!.json();
    expect(body.error).toBe(true);
  });
});
