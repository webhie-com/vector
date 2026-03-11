import { mkdtempSync } from 'node:fs';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CheckpointManager } from '../../src/checkpoint/manager';

const CONFIG = {
  defaultPort: 3015,
  host: '127.0.0.1',
  version: '1.0.0',
  versionHeader: 'x-vector-checkpoint-version',
  warmupDurationMs: 5000,
  benchmarkDurationMs: 5000,
  concurrency: 50,
  timeoutMs: 15000,
};

type ScenarioResult = {
  name: string;
  requests: number;
  success: number;
  errors: number;
  throughputRps: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

type LatencyResult = {
  name: string;
  samples: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore retries
    }
    await Bun.sleep(100);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

async function runNoRateLimitScenario(
  name: string,
  url: string,
  requestPath: string,
  headers: HeadersInit | undefined,
  durationMs: number,
  concurrency: number
): Promise<ScenarioResult> {
  const durations: number[] = [];
  let remaining = true;
  let success = 0;
  let errors = 0;

  const startedAt = performance.now();
  const deadline = startedAt + durationMs;

  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      if (!remaining || performance.now() >= deadline) {
        break;
      }

      const t0 = performance.now();
      try {
        const response = await fetch(`${url}${requestPath}`, {
          method: 'GET',
          headers,
        });
        await response.arrayBuffer();
        if (response.ok) {
          success += 1;
        } else {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
      durations.push(performance.now() - t0);
    }
  });

  await Promise.all(workers);
  remaining = false;

  const elapsedMs = performance.now() - startedAt;
  const totalRequests = success + errors;
  const throughputRps = elapsedMs > 0 ? (totalRequests / elapsedMs) * 1000 : 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const avgMs = sorted.length > 0 ? sorted.reduce((sum, n) => sum + n, 0) / sorted.length : 0;

  return {
    name,
    requests: totalRequests,
    success,
    errors,
    throughputRps,
    avgMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

async function runScenarioWithWarmup(
  name: string,
  url: string,
  requestPath: string,
  headers: HeadersInit | undefined
): Promise<ScenarioResult> {
  console.log(`\nWarming: ${name}`);
  await runNoRateLimitScenario(
    `${name} [warmup]`,
    url,
    requestPath,
    headers,
    CONFIG.warmupDurationMs,
    CONFIG.concurrency
  );

  console.log(`Benchmarking: ${name}`);
  return await runNoRateLimitScenario(
    `${name} [benchmark]`,
    url,
    requestPath,
    headers,
    CONFIG.benchmarkDurationMs,
    CONFIG.concurrency
  );
}

function printScenario(result: ScenarioResult): void {
  console.log(`\n${result.name}`);
  console.log(`  requests:   ${result.requests}`);
  console.log(`  success:    ${result.success}`);
  console.log(`  errors:     ${result.errors}`);
  console.log(`  throughput: ${result.throughputRps.toFixed(1)} req/s`);
  console.log(
    `  latency:    avg ${result.avgMs.toFixed(2)}ms | p50 ${result.p50Ms.toFixed(2)}ms | p95 ${result.p95Ms.toFixed(2)}ms | p99 ${result.p99Ms.toFixed(2)}ms`
  );
}

function printDelta(label: string, a: ScenarioResult, b: ScenarioResult): void {
  const p95Delta = a.p95Ms > 0 ? ((b.p95Ms - a.p95Ms) / a.p95Ms) * 100 : 0;
  const rpsDelta = a.throughputRps > 0 ? ((b.throughputRps - a.throughputRps) / a.throughputRps) * 100 : 0;
  console.log(`\n${label}`);
  console.log(`  p95 delta: ${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}%`);
  console.log(`  rps delta: ${rpsDelta >= 0 ? '+' : ''}${rpsDelta.toFixed(2)}%`);
}

async function runLatencyProbe(
  name: string,
  url: string,
  requestPath: string,
  headers: HeadersInit | undefined,
  samples = 300
): Promise<LatencyResult> {
  const durations: number[] = [];

  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const response = await fetch(`${url}${requestPath}`, {
      method: 'GET',
      headers,
    });
    await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`Latency probe failed (${name}) with status ${response.status}`);
    }
    durations.push(performance.now() - t0);
  }

  const sorted = durations.sort((a, b) => a - b);
  const avgMs = sorted.reduce((sum, n) => sum + n, 0) / sorted.length;

  return {
    name,
    samples: sorted.length,
    avgMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

function printLatency(result: LatencyResult): void {
  console.log(`\n${result.name}`);
  console.log(`  samples:  ${result.samples}`);
  console.log(
    `  latency:  avg ${result.avgMs.toFixed(2)}ms | p50 ${result.p50Ms.toFixed(2)}ms | p95 ${result.p95Ms.toFixed(2)}ms | p99 ${result.p99Ms.toFixed(2)}ms`
  );
}

function printLatencyDelta(label: string, a: LatencyResult, b: LatencyResult): void {
  const p95Delta = a.p95Ms > 0 ? ((b.p95Ms - a.p95Ms) / a.p95Ms) * 100 : 0;
  const avgDelta = a.avgMs > 0 ? ((b.avgMs - a.avgMs) / a.avgMs) * 100 : 0;
  console.log(`\n${label}`);
  console.log(`  avg delta: ${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(2)}%`);
  console.log(`  p95 delta: ${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}%`);
}

async function createPerfRoutes(routesDir: string): Promise<void> {
  await mkdir(routesDir, { recursive: true });

  const routeSource = `
let rawCounter = 0;
let cacheCounter = 0;
let realisticCounter = 0;

export const health = {
  entry: { method: 'GET', path: '/health' },
  options: { method: 'GET', path: '/health', expose: true },
  handler: async () => ({ status: 'ok' }),
};

export const rawPerf = {
  entry: { method: 'GET', path: '/perf/raw' },
  options: { method: 'GET', path: '/perf/raw', expose: true },
  handler: async () => {
    rawCounter += 1;
    let acc = 0;
    for (let i = 0; i < 2000; i++) {
      acc += i;
    }
    return { source: 'raw', rawCounter, acc };
  },
};

export const cachedPerf = {
  entry: { method: 'GET', path: '/perf/cached' },
  options: { method: 'GET', path: '/perf/cached', expose: true, cache: { ttl: 60 } },
  handler: async () => {
    cacheCounter += 1;
    let acc = 0;
    for (let i = 0; i < 2000; i++) {
      acc += i;
    }
    return { source: 'cached', cacheCounter, acc };
  },
};

export const realisticPerf = {
  entry: { method: 'GET', path: '/perf/realistic' },
  options: {
    method: 'GET',
    path: '/perf/realistic',
    expose: true,
    schema: {
      input: {
        '~standard': {
          version: 1,
          vendor: 'checkpoint-benchmark',
          validate: async (payload) => {
            const query = payload?.query ?? {};
            const headers = payload?.headers ?? {};
            const rawId = Array.isArray(query.id) ? query.id[0] : query.id;
            const id = Number(rawId);

            if (!Number.isInteger(id) || id <= 0) {
              return {
                issues: [{ message: 'id must be a positive integer', path: ['query', 'id'], code: 'invalid_type' }],
              };
            }

            return {
              value: {
                ...payload,
                query: { ...query, id },
                headers: {
                  ...headers,
                  'x-request-scope':
                    typeof headers['x-request-scope'] === 'string' && headers['x-request-scope'].length > 0
                      ? headers['x-request-scope']
                      : 'public',
                },
              },
            };
          },
        },
      },
    },
  },
  handler: async (req) => {
    realisticCounter += 1;
    await Bun.sleep(1);

    const id = Number(req.validatedInput?.query?.id ?? 0);
    const scope = req.validatedInput?.headers?.['x-request-scope'] ?? req.request.headers.get('x-request-scope') ?? 'public';

    let acc = 0;
    for (let i = 0; i < 4000; i++) {
      acc += i;
    }

    return { source: 'realistic', realisticCounter, id, scope, acc };
  },
};
`;

  await writeFile(join(routesDir, 'perf.ts'), routeSource, 'utf-8');
}

async function run(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'vector-checkpoint-bench-'));
  const routesDir = join(root, 'routes');
  const storageDir = join(root, 'checkpoints');

  let serverProcess: ReturnType<typeof Bun.spawn> | null = null;

  try {
    await createPerfRoutes(routesDir);

    const manager = new CheckpointManager({ storageDir });
    await manager.publish({
      version: CONFIG.version,
      routesDir,
    });

    const serverScript = new URL('./checkpoint-raw-fetch-server-process.ts', import.meta.url).pathname;
    let port = Number(process.env.PORT) || 0;
    let started = false;

    for (let attempt = 0; attempt < 12 && !started; attempt++) {
      if (!port) {
        port = CONFIG.defaultPort + Math.floor(Math.random() * 2000);
      }

      serverProcess = Bun.spawn(['bun', 'run', serverScript], {
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: CONFIG.host,
          ROUTES_DIR: routesDir,
          CHECKPOINT_STORAGE_DIR: storageDir,
          CHECKPOINT_VERSION_HEADER: CONFIG.versionHeader,
        },
        stdout: 'pipe',
        stderr: 'inherit',
      });

      const stdout = serverProcess.stdout;
      if (!stdout || typeof stdout === 'number') {
        throw new Error('Failed to start checkpoint benchmark server process');
      }

      const reader = stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        const readyTimeoutAt = Date.now() + 4000;
        while (!buffer.includes('READY') && Date.now() < readyTimeoutAt) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            buffer += decoder.decode(value);
          }
        }

        if (buffer.includes('READY')) {
          started = true;
          break;
        }
      } finally {
        reader.releaseLock();
      }

      serverProcess.kill();
      await serverProcess.exited;
      serverProcess = null;
      port = 0;
    }

    if (!started || !serverProcess) {
      throw new Error('Failed to start benchmark server after multiple port attempts.');
    }

    const baseUrl = `http://${CONFIG.host}:${port}`;
    await waitForReady(baseUrl, CONFIG.timeoutMs);

    const checkpointHeaders = {
      [CONFIG.versionHeader]: CONFIG.version,
    };

    console.log('\nCheckpoint Raw Fetch Benchmark (No Rate Limit)');
    console.log(`  baseUrl:      ${baseUrl}`);
    console.log(`  warmup:       ${(CONFIG.warmupDurationMs / 1000).toFixed(0)}s/scenario`);
    console.log(`  benchmark:    ${(CONFIG.benchmarkDurationMs / 1000).toFixed(0)}s/scenario`);
    console.log(`  concurrency:  ${CONFIG.concurrency}`);
    console.log(`  checkpoint hdr: ${CONFIG.versionHeader}: ${CONFIG.version}`);

    const liveRaw = await runScenarioWithWarmup('Live (No Header) /perf/raw', baseUrl, '/perf/raw', undefined);

    const checkpointRaw = await runScenarioWithWarmup(
      'Checkpoint (Header) /perf/raw',
      baseUrl,
      '/perf/raw',
      checkpointHeaders
    );

    // Warm cache independently for each path variant.
    await fetch(`${baseUrl}/perf/cached`);
    await fetch(`${baseUrl}/perf/cached`, { headers: checkpointHeaders });

    const liveCached = await runScenarioWithWarmup(
      'Live (No Header) /perf/cached [cache warm]',
      baseUrl,
      '/perf/cached',
      undefined
    );

    const checkpointCached = await runScenarioWithWarmup(
      'Checkpoint (Header) /perf/cached [cache warm]',
      baseUrl,
      '/perf/cached',
      checkpointHeaders
    );

    const realisticHeaders = {
      'x-request-scope': 'public',
    };
    const checkpointRealisticHeaders = {
      ...checkpointHeaders,
      'x-request-scope': 'public',
    };

    const liveRealistic = await runScenarioWithWarmup(
      'Live (No Header) /perf/realistic?id=123',
      baseUrl,
      '/perf/realistic?id=123',
      realisticHeaders
    );

    const checkpointRealistic = await runScenarioWithWarmup(
      'Checkpoint (Header) /perf/realistic?id=123',
      baseUrl,
      '/perf/realistic?id=123',
      checkpointRealisticHeaders
    );

    printScenario(liveRaw);
    printScenario(checkpointRaw);
    printScenario(liveCached);
    printScenario(checkpointCached);
    printScenario(liveRealistic);
    printScenario(checkpointRealistic);

    printDelta('Delta: Checkpoint Raw vs Live Raw', liveRaw, checkpointRaw);
    printDelta('Delta: Checkpoint Cached vs Live Cached', liveCached, checkpointCached);
    printDelta('Delta: Checkpoint Realistic vs Live Realistic', liveRealistic, checkpointRealistic);

    console.log('\nLatency Probe (Sequential)');
    const liveRawLatency = await runLatencyProbe('Latency Live /perf/raw', baseUrl, '/perf/raw', undefined);
    const checkpointRawLatency = await runLatencyProbe(
      'Latency Checkpoint /perf/raw',
      baseUrl,
      '/perf/raw',
      checkpointHeaders
    );
    const liveCachedLatency = await runLatencyProbe('Latency Live /perf/cached', baseUrl, '/perf/cached', undefined);
    const checkpointCachedLatency = await runLatencyProbe(
      'Latency Checkpoint /perf/cached',
      baseUrl,
      '/perf/cached',
      checkpointHeaders
    );
    const liveRealisticLatency = await runLatencyProbe(
      'Latency Live /perf/realistic?id=123',
      baseUrl,
      '/perf/realistic?id=123',
      realisticHeaders
    );
    const checkpointRealisticLatency = await runLatencyProbe(
      'Latency Checkpoint /perf/realistic?id=123',
      baseUrl,
      '/perf/realistic?id=123',
      checkpointRealisticHeaders
    );

    printLatency(liveRawLatency);
    printLatency(checkpointRawLatency);
    printLatency(liveCachedLatency);
    printLatency(checkpointCachedLatency);
    printLatency(liveRealisticLatency);
    printLatency(checkpointRealisticLatency);

    printLatencyDelta('Latency Delta: Checkpoint Raw vs Live Raw', liveRawLatency, checkpointRawLatency);
    printLatencyDelta('Latency Delta: Checkpoint Cached vs Live Cached', liveCachedLatency, checkpointCachedLatency);
    printLatencyDelta(
      'Latency Delta: Checkpoint Realistic vs Live Realistic',
      liveRealisticLatency,
      checkpointRealisticLatency
    );

    const totalErrors =
      liveRaw.errors +
      checkpointRaw.errors +
      liveCached.errors +
      checkpointCached.errors +
      liveRealistic.errors +
      checkpointRealistic.errors;
    if (totalErrors > 0) {
      throw new Error(`Benchmark observed ${totalErrors} request errors.`);
    }
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await serverProcess.exited;
    }

    await rm(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
