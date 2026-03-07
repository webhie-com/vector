import { createClient } from './utils/http-client';
import { MetricsCollector } from './utils/metrics';
import { Reporter } from './utils/reporter';
import { nextIOSchemaRequestPlan } from './workloads/io-schema-workload';

const CONFIG = {
  port: 3006,
  baseUrl: 'http://localhost:3006',
  warmupRequests: 200,
  durationMs: 20000,
  concurrencySweep: [10, 25, 50, 100, 200, 300],
};

interface SweepResult {
  concurrency: number;
  throughput: number;
  avgMs: number;
  p95Ms: number;
  errorRate: number;
  totalRequests: number;
}

interface EndpointStats {
  total: number;
  success: number;
  failed: number;
}

interface DiagnosticSummary {
  statusCounts: Record<string, number>;
  endpointCounts: Record<string, EndpointStats>;
  errorMessages: Record<string, number>;
}

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

function endpointLabel(method: string, path: string): string {
  if (method === 'POST' && path === '/api/orders') return 'POST /api/orders';
  if (method === 'GET' && path.startsWith('/api/orders/')) return 'GET /api/orders/:id';
  if (method === 'GET' && path.startsWith('/api/orders')) return 'GET /api/orders';
  return `${method} ${path}`;
}

function incrementCount(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

function incrementEndpoint(stats: Record<string, EndpointStats>, key: string, ok: boolean): void {
  const entry = stats[key] || { total: 0, success: 0, failed: 0 };
  entry.total += 1;
  if (ok) {
    entry.success += 1;
  } else {
    entry.failed += 1;
  }
  stats[key] = entry;
}

async function runWorker(
  client: ReturnType<typeof createClient>,
  endAt: number,
  metrics: MetricsCollector,
  diagnostics: DiagnosticSummary
): Promise<void> {
  while (Date.now() < endAt) {
    const plan = nextIOSchemaRequestPlan();
    const label = endpointLabel(plan.method, plan.path);
    try {
      const response =
        plan.method === 'POST'
          ? await client.post(plan.path, plan.body, { timeout: 10000 })
          : await client.get(plan.path, { timeout: 10000 });
      metrics.recordResponse(response.time, response.status);
      incrementCount(diagnostics.statusCounts, String(response.status));
      incrementEndpoint(diagnostics.endpointCounts, label, response.status >= 200 && response.status < 400);
    } catch (error) {
      metrics.recordError(error as Error);
      incrementCount(diagnostics.statusCounts, 'network_error');
      incrementEndpoint(diagnostics.endpointCounts, label, false);
      const message = error instanceof Error ? error.message : String(error);
      incrementCount(diagnostics.errorMessages, message);
    }
  }
}

async function runBenchmark(): Promise<void> {
  Reporter.printTestHeader(
    'Concurrency Sweep: IO + Schema Validation',
    'Promise-based simulated DB latency + standard schema input validation workload'
  );

  let serverProcess: ReturnType<typeof Bun.spawn> | null = null;
  const client = createClient(CONFIG.baseUrl);
  const results: SweepResult[] = [];

  try {
    console.log('Starting IO/schema benchmark server...');
    serverProcess = Bun.spawn(['bun', 'run', new URL('./test-server-io-schema-process.ts', import.meta.url).pathname], {
      env: { ...process.env, PORT: String(CONFIG.port) },
      stdout: 'pipe',
      stderr: 'inherit',
    });

    const stdout = serverProcess.stdout;
    if (!stdout || typeof stdout === 'number') {
      throw new Error('Failed to start benchmark server: stdout pipe is not available');
    }

    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!buffer.includes('READY')) {
        const { value, done } = await reader.read();
        if (done) {
          if (!buffer.includes('READY')) {
            throw new Error('Benchmark server exited before READY');
          }
          break;
        }
        if (value) {
          buffer += decoder.decode(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    await waitForServer(CONFIG.baseUrl);

    console.log(`Warmup (${CONFIG.warmupRequests} requests)...`);
    for (let i = 0; i < CONFIG.warmupRequests; i++) {
      const plan = nextIOSchemaRequestPlan();
      if (plan.method === 'POST') {
        await client.post(plan.path, plan.body, { timeout: 10000 });
      } else {
        await client.get(plan.path, { timeout: 10000 });
      }
    }

    for (const concurrency of CONFIG.concurrencySweep) {
      Reporter.printTestHeader(
        `Sweep @ concurrency=${concurrency}`,
        `Duration ${(CONFIG.durationMs / 1000).toFixed(0)}s, mixed validated API workload`
      );

      const metrics = new MetricsCollector();
      const diagnostics: DiagnosticSummary = {
        statusCounts: {},
        endpointCounts: {},
        errorMessages: {},
      };
      metrics.start();
      const endAt = Date.now() + CONFIG.durationMs;

      const workers = Array.from({ length: concurrency }, () => runWorker(client, endAt, metrics, diagnostics));
      await Promise.all(workers);

      metrics.stop();
      const summary = metrics.getMetrics();
      Reporter.printMetrics(summary, `Results @ concurrency=${concurrency}`);

      results.push({
        concurrency,
        throughput: summary.throughput,
        avgMs: summary.averageResponseTime,
        p95Ms: summary.percentiles.p95,
        errorRate: summary.errorRate,
        totalRequests: summary.totalRequests,
      });

      const statusRows = Object.entries(diagnostics.statusCounts).sort(([a], [b]) => a.localeCompare(b));
      console.log('\nStatus breakdown:');
      for (const [status, count] of statusRows) {
        console.log(`  ${status.padEnd(14)} ${String(count).padStart(8)}`);
      }

      const endpointRows = Object.entries(diagnostics.endpointCounts).sort(([a], [b]) => a.localeCompare(b));
      console.log('\nEndpoint breakdown:');
      for (const [endpoint, stats] of endpointRows) {
        const errorPct = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;
        console.log(
          `  ${endpoint.padEnd(22)} total=${String(stats.total).padStart(7)} ok=${String(stats.success).padStart(
            7
          )} fail=${String(stats.failed).padStart(7)} err=${errorPct.toFixed(2).padStart(6)}%`
        );
      }

      const topErrors = Object.entries(diagnostics.errorMessages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      if (topErrors.length > 0) {
        console.log('\nTop network/client errors:');
        for (const [message, count] of topErrors) {
          console.log(`  (${count}) ${message}`);
        }
      }
    }

    const best = results.reduce((acc, row) => (row.throughput > acc.throughput ? row : acc), results[0]);

    console.log('\nSummary (IO + schema workload)');
    console.log('Concurrency | Throughput(rps) | Avg(ms) | P95(ms) | Error(%) | Requests');
    for (const row of results) {
      console.log(
        `${String(row.concurrency).padStart(11)} | ${row.throughput.toFixed(1).padStart(15)} | ${row.avgMs
          .toFixed(1)
          .padStart(7)} | ${row.p95Ms.toFixed(1).padStart(7)} | ${row.errorRate.toFixed(2).padStart(8)} | ${String(
          row.totalRequests
        ).padStart(8)}`
      );
    }

    console.log(
      `\nPeak throughput: ${best.throughput.toFixed(1)} rps at concurrency=${best.concurrency} (p95=${best.p95Ms.toFixed(
        1
      )}ms, errors=${best.errorRate.toFixed(2)}%)`
    );
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await serverProcess.exited;
    }
  }
}

if (import.meta.main) {
  runBenchmark().catch((error) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}
