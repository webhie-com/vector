import { createClient } from './utils/http-client';
import type { Metrics } from './utils/metrics';
import { CPUMonitor, MemoryMonitor, MetricsCollector } from './utils/metrics';
import { Reporter } from './utils/reporter';
import type { WorkerResult } from './benchmark-worker';

// Benchmark configuration
const CONFIG = {
  port: 3004,
  baseUrl: 'http://localhost:3004',
  warmupRequests: 100,
  benchmarkDuration: 30000, // 30 seconds per benchmark
  // Rate-limited runs: token bucket keeps actual ≈ target when server has capacity.
  // Stops at 1000 — anything higher saturates the JS client before the server.
  targetRPS: [10, 50, 100, 500, 1000],
  // Concurrency sweep: back-to-back workers (no rate limit) to find the server's
  // max throughput ceiling using the JS client as a driver.
  // NOTE: The Bun JS client is single-threaded — beyond ~200-500 workers the event
  // loop saturates and throughput plateaus or degrades regardless of server capacity.
  // For true server limits use an external tool (wrk/k6) from a separate machine.
  concurrencySweep: [10, 25, 50, 100],
};

interface BenchmarkResult {
  rps: number;
  metrics: Metrics;
  memory: {
    average: number;
    max: number;
    growth: number;
  };
  cpu: {
    total: number;
    average: number;
  };
}

// Token bucket rate limiter — shared across all workers in a benchmark run.
// Workers call consume() before each request; if the bucket is empty they wait
// until the next token arrives.  This ensures actual throughput tracks targetRPS
// when the server has capacity, and reveals saturation when it doesn't.
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly ratePerMs: number;
  private readonly capacity: number;

  constructor(ratePerSecond: number) {
    this.ratePerMs = ratePerSecond / 1000;
    // Cap burst to 100 tokens so the bucket doesn't flood workers at startup.
    // Without this, a 20k-RPS bucket starts full and all 500 workers stampede
    // simultaneously before the rate limiter can pace them.
    this.capacity = Math.min(ratePerSecond, 100);
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  async consume(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      this.lastRefill = now;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerMs);

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Wait just long enough for one more token
      const waitMs = Math.ceil((1 - this.tokens) / this.ratePerMs);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, waitMs)));
    }
  }
}

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${url}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function runBenchmark() {
  Reporter.printTestHeader('Benchmark Suite', 'Comprehensive performance benchmarking across various request rates');

  let serverProcess: ReturnType<typeof Bun.spawn> | null = null;
  const client = createClient(CONFIG.baseUrl);
  const results: BenchmarkResult[] = [];
  let baselineMetrics: Metrics | undefined;

  try {
    // Start test server in a separate process so it gets its own event loop
    // and doesn't compete with benchmark workers for the same JS thread
    console.log('Starting test server...');
    serverProcess = Bun.spawn(['bun', 'run', new URL('./test-server-process.ts', import.meta.url).pathname], {
      env: { ...process.env, PORT: String(CONFIG.port) },
      stdout: 'pipe',
      stderr: 'inherit',
    });

    // Wait until the server writes "READY"
    if (!serverProcess.stdout) {
      throw new Error('Failed to start test server: stdout is not available on spawned process');
    }
    const reader = serverProcess.stdout.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (!buf.includes('READY')) {
        const { value, done } = await reader.read();
        if (done) {
          if (!buf.includes('READY')) {
            throw new Error('Test server exited or closed stdout before emitting READY');
          }
          break;
        }
        if (value) {
          buf += decoder.decode(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    await waitForServer(CONFIG.baseUrl);

    // Warmup phase
    console.log('\nRunning warmup phase...');
    const warmupMetrics = new MetricsCollector();
    warmupMetrics.start();

    for (let i = 0; i < CONFIG.warmupRequests; i++) {
      const endpoints = ['/health', '/api/products', '/api/products/1'];
      const endpoint = endpoints[i % endpoints.length];

      try {
        const response = await client.get(endpoint);
        warmupMetrics.recordResponse(response.time, response.status);
      } catch (error) {
        warmupMetrics.recordError(error as Error);
      }
    }

    warmupMetrics.stop();
    console.log('Warmup complete\n');

    // Run benchmarks at different request rates
    for (const targetRPS of CONFIG.targetRPS) {
      Reporter.printTestHeader(
        `Benchmark: ${targetRPS} RPS (target)`,
        `Paced at ${targetRPS} req/s — actual throughput reveals server capacity`
      );

      const metrics = new MetricsCollector();
      const memoryMonitor = new MemoryMonitor();
      const cpuMonitor = new CPUMonitor();

      metrics.start();
      memoryMonitor.start(1000);
      cpuMonitor.start();

      const startTime = Date.now();
      let totalRequests = 0;
      let isRunning = true;

      // Endpoint rotation for realistic traffic
      const endpoints = [
        { path: '/health', weight: 2 },
        { path: '/api/products', weight: 4 },
        { path: '/api/products/1', weight: 2 },
        { path: '/api/products/2', weight: 2 },
        { path: '/api/compute?iterations=100', weight: 1 },
        { path: '/api/metrics', weight: 1 },
      ];

      const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);

      const selectEndpoint = () => {
        let random = Math.random() * totalWeight;
        for (const endpoint of endpoints) {
          random -= endpoint.weight;
          if (random <= 0) return endpoint.path;
        }
        return endpoints[0].path;
      };

      // Request sender
      const sendRequest = async () => {
        if (!isRunning) return;

        const path = selectEndpoint();

        try {
          const response = await client.get(path, { timeout: 5000 });
          metrics.recordResponse(response.time, response.status);
          totalRequests++;
        } catch (error) {
          metrics.recordError(error as Error);
        }

        cpuMonitor.sample();
      };

      // Rate-limited workers: a shared token bucket paces the overall request rate
      // to targetRPS. Concurrency is sized to keep the pipeline full — roughly
      // targetRPS × expected latency (1ms) — so we don't spawn 500 idle workers
      // when all we need is a handful.
      const limiter = new TokenBucket(targetRPS);
      const concurrency = Math.max(Math.ceil(targetRPS * 0.01), 2); // ~1% of RPS, min 2
      const workers = Array.from({ length: concurrency }, async () => {
        while (isRunning) {
          await limiter.consume();
          await sendRequest();
        }
      });

      // Progress reporting
      const progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed / CONFIG.benchmarkDuration) * 100;

        const progressBar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
        process.stdout.write(
          `\r[${progressBar}] ${progress.toFixed(1)}% | ` +
            `Requests: ${totalRequests} | ` +
            `Time: ${Reporter.formatDuration(elapsed)}`
        );

        if (elapsed >= CONFIG.benchmarkDuration) {
          isRunning = false;
          clearInterval(progressTimer);
        }
      }, 500);

      // Wait for all workers to finish
      await Promise.all(workers);

      console.log('\n'); // New line after progress bar

      // Stop monitoring
      metrics.stop();
      memoryMonitor.stop();

      // Collect results
      const testMetrics = metrics.getMetrics();
      const memoryMetrics = memoryMonitor.getMetrics();
      const cpuMetrics = cpuMonitor.getMetrics();

      results.push({
        rps: targetRPS,
        metrics: testMetrics,
        memory: {
          average: memoryMetrics.average.heapUsed,
          max: memoryMetrics.max.heapUsed,
          growth: memoryMetrics.growth,
        },
        cpu: {
          total: cpuMetrics.totalCPUTime,
          average: cpuMetrics.averageCPUTime,
        },
      });

      // Report individual benchmark results
      Reporter.printMetrics(testMetrics, `${targetRPS} RPS target | ${testMetrics.throughput.toFixed(0)} RPS actual`);

      console.log('\nResource Usage');
      console.log(`  Memory Avg:  ${Reporter.formatBytes(memoryMetrics.average.heapUsed)}`);
      console.log(`  Memory Max:  ${Reporter.formatBytes(memoryMetrics.max.heapUsed)}`);
      console.log(`  Memory Growth: ${memoryMetrics.growth.toFixed(1)}%`);
      console.log(`  CPU Total:   ${cpuMetrics.totalCPUTime.toFixed(0)}ms`);
      console.log(`  CPU Average: ${cpuMetrics.averageCPUTime.toFixed(1)}ms`);

      // Store baseline for comparison
      if (!baselineMetrics) {
        baselineMetrics = testMetrics;
      }

      // Cool down between benchmarks
      if (targetRPS !== CONFIG.targetRPS[CONFIG.targetRPS.length - 1]) {
        console.log('\nCooling down...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Concurrency sweep — Bun Worker threads, back-to-back raw fetch, no rate limit.
    // Each Worker runs on its own event loop (true parallelism across CPU cores),
    // bypassing the single-threaded client bottleneck that capped the old sweep.
    // Total connections = numCores × connectionsPerCore.
    console.log('\n' + '═'.repeat(80));
    console.log(' CONCURRENCY SWEEP (max throughput — multi-core Workers)');
    console.log('═'.repeat(80));

    const numCores = navigator.hardwareConcurrency || 4;
    const sweepDuration = 10000; // 10s per tier — enough to stabilise
    const sweepEndpoints = ['/health', '/api/products', '/api/products/1'];
    const sweepResults: Array<{
      concurrency: number;
      throughput: number;
      p95: number;
      errorRate: number;
    }> = [];

    console.log(`  Using ${numCores} CPU cores\n`);

    for (const totalConcurrency of CONFIG.concurrencySweep) {
      // Distribute connections evenly across cores; at least 1 connection per worker
      const connectionsPerCore = Math.max(1, Math.ceil(totalConcurrency / numCores));
      const activeWorkerCount = Math.min(numCores, totalConcurrency);

      Reporter.printTestHeader(
        `Concurrency: ${totalConcurrency} (${activeWorkerCount} cores × ${connectionsPerCore} conns)`,
        `Raw fetch, no rate limit`
      );

      const workerPromises = Array.from({ length: activeWorkerCount }, () => {
        const w = new Worker(new URL('./benchmark-worker.ts', import.meta.url).href);
        return new Promise<WorkerResult>((resolve) => {
          w.onmessage = (msg: MessageEvent<WorkerResult>) => {
            resolve(msg.data);
            w.terminate();
          };
          w.postMessage({
            baseUrl: CONFIG.baseUrl,
            concurrency: connectionsPerCore,
            duration: sweepDuration,
            endpoints: sweepEndpoints,
          });
        });
      });

      const workerResults = await Promise.all(workerPromises);

      // Aggregate across all workers
      const allTimes = workerResults.flatMap((r) => r.responseTimes).sort((a, b) => a - b);
      const total = workerResults.reduce((s, r) => s + r.total, 0);
      const _ = workerResults.reduce((s, r) => s + r.success, 0);
      const failed = workerResults.reduce((s, r) => s + r.failed, 0);
      const throughput = total / (sweepDuration / 1000);
      const errorRate = total > 0 ? (failed / total) * 100 : 0;
      const p95 = allTimes.length ? allTimes[Math.floor(allTimes.length * 0.95)] : 0;
      const p99 = allTimes.length ? allTimes[Math.floor(allTimes.length * 0.99)] : 0;

      sweepResults.push({
        concurrency: totalConcurrency,
        throughput,
        p95,
        errorRate,
      });

      console.log(
        `  Throughput: ${throughput.toFixed(0)} req/s | P95: ${p95}ms | P99: ${p99}ms | Errors: ${errorRate.toFixed(1)}%`
      );

      if (totalConcurrency !== CONFIG.concurrencySweep[CONFIG.concurrencySweep.length - 1]) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const peakSweep = sweepResults.reduce((best, r) => (r.throughput > best.throughput ? r : best), sweepResults[0]);
    console.log(
      `\nPeak: ${peakSweep.throughput.toFixed(0)} req/s at ${peakSweep.concurrency} connections (P95 ${peakSweep.p95}ms, ${peakSweep.errorRate.toFixed(1)}% errors)`
    );

    // Generate comprehensive benchmark report
    console.log('\n' + '═'.repeat(80));
    console.log(' BENCHMARK SUMMARY');
    console.log('═'.repeat(80));

    // Performance scaling analysis
    console.log('\nPerformance Scaling');
    console.log('─'.repeat(80));
    console.log('Target RPS\tActual RPS\tP50\t\tP95\t\tP99\t\tErrors\t\tMemory');
    console.log('─'.repeat(80));

    results.forEach((result) => {
      console.log(
        `${result.rps}\t` +
          `${result.metrics.throughput.toFixed(1)}\t\t` +
          `${result.metrics.percentiles.p50.toFixed(0)}ms\t\t` +
          `${result.metrics.percentiles.p95.toFixed(0)}ms\t\t` +
          `${result.metrics.percentiles.p99.toFixed(0)}ms\t\t` +
          `${result.metrics.errorRate.toFixed(1)}%\t\t` +
          `${Reporter.formatBytes(result.memory.max)}`
      );
    });
    console.log('─'.repeat(80));

    // Find optimal operating point
    const optimalResult = results.reduce((best, current) => {
      // Prioritize throughput while keeping error rate < 1% and P95 < 1000ms
      if (current.metrics.errorRate < 1 && current.metrics.percentiles.p95 < 1000) {
        if (current.metrics.throughput > best.metrics.throughput) {
          return current;
        }
      }
      return best;
    }, results[0]);

    console.log('\nOptimal Operating Point');
    console.log(`  Target RPS:  ${optimalResult.rps}`);
    console.log(`  Throughput:  ${optimalResult.metrics.throughput.toFixed(1)} req/s`);
    console.log(`  P95 Time:    ${optimalResult.metrics.percentiles.p95.toFixed(0)}ms`);
    console.log(`  Error Rate:  ${optimalResult.metrics.errorRate.toFixed(1)}%`);

    // Identify performance limits
    console.log('\nPerformance Limits');

    const firstFailure = results.find((r) => r.metrics.errorRate > 5);
    if (firstFailure) {
      console.log(`  Error threshold (>5%) reached at: ${firstFailure.rps} RPS`);
    }

    const firstSlow = results.find((r) => r.metrics.percentiles.p95 > 2000);
    if (firstSlow) {
      console.log(`  Response time threshold (P95 >2s) reached at: ${firstSlow.rps} RPS`);
    }

    const maxThroughput = Math.max(...results.map((r) => r.metrics.throughput));
    console.log(`  Maximum achieved throughput: ${maxThroughput.toFixed(2)} req/s`);

    // Resource efficiency analysis
    console.log('\nResource Efficiency');
    results.forEach((result) => {
      const efficiency = result.metrics.throughput / (result.cpu.average || 1);
      console.log(
        `  ${result.rps} RPS: ${efficiency.toFixed(2)} req/ms CPU` +
          ` (${Reporter.formatBytes(result.memory.average / result.metrics.throughput)}/req)`
      );
    });

    // Performance characteristics
    console.log('\nPerformance Characteristics');

    // Check if performance scales linearly
    const scalingFactors = results.slice(1).map((r, i) => {
      const prev = results[i];
      return r.metrics.throughput / prev.metrics.throughput;
    });

    const avgScaling = scalingFactors.reduce((sum, f) => sum + f, 0) / scalingFactors.length;

    if (avgScaling > 0.8) {
      console.log('  ✓ Performance scales well with load');
    } else {
      console.log('  ⚠ Performance degradation under high load');
    }

    // Check for memory leaks
    const memoryGrowthRate = results.map((r) => r.memory.growth);
    const avgGrowth = memoryGrowthRate.reduce((sum, g) => sum + g, 0) / memoryGrowthRate.length;

    if (avgGrowth < 5) {
      console.log('  ✓ No memory leaks detected');
    } else if (avgGrowth < 15) {
      console.log('  ⚠ Minor memory growth detected');
    } else {
      console.log('  ✗ Significant memory growth detected');
    }

    // Save detailed results
    const benchmarkData = {
      config: CONFIG,
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        targetRPS: r.rps,
        metrics: r.metrics,
        memory: r.memory,
        cpu: r.cpu,
      })),
      analysis: {
        optimalRPS: optimalResult.rps,
        maxThroughput,
        avgScalingFactor: avgScaling,
        avgMemoryGrowth: avgGrowth,
      },
      concurrencySweep: sweepResults,
    };

    await Bun.write('benchmark-results/results.json', JSON.stringify(benchmarkData, null, 2));

    console.log('\nDetailed results saved to benchmark-results/results.json');

    // Final verdict
    console.log('\n' + '═'.repeat(80));
    console.log('Benchmark suite completed successfully');
    console.log('═'.repeat(80));
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  } finally {
    serverProcess?.kill();
  }
}

// Run if executed directly
if (import.meta.main) {
  runBenchmark();
}
