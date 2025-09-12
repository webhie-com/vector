import type { Server } from 'bun';
import testServer from './test-server';
import { createClient } from './utils/http-client';
import type { Metrics } from './utils/metrics';
import { CPUMonitor, MemoryMonitor, MetricsCollector } from './utils/metrics';
import { Reporter } from './utils/reporter';

// Benchmark configuration
const CONFIG = {
  port: 3004,
  baseUrl: 'http://localhost:3004',
  warmupRequests: 100,
  benchmarkDuration: 30000, // 30 seconds per benchmark
  targetRPS: [10, 50, 100, 200, 500], // Different request rates to test
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

async function runBenchmark() {
  Reporter.printTestHeader(
    'Benchmark Suite',
    'Comprehensive performance benchmarking across various request rates'
  );

  let server: Server;
  const client = createClient(CONFIG.baseUrl);
  const results: BenchmarkResult[] = [];
  let baselineMetrics: Metrics | undefined;

  try {
    // Start test server
    console.log('Starting test server...');
    server = await testServer.serve({
      port: CONFIG.port,
      hostname: '0.0.0.0',
      development: false,
    });

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

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
        `Benchmark: ${targetRPS} RPS`,
        `Testing performance at ${targetRPS} requests per second`
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

      // Schedule requests at target rate
      const requestInterval = 1000 / targetRPS;
      const requestTimer = setInterval(sendRequest, requestInterval);

      // Progress reporting
      const progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed / CONFIG.benchmarkDuration) * 100;

        const progressBar =
          '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
        process.stdout.write(
          `\r[${progressBar}] ${progress.toFixed(1)}% | ` +
            `Requests: ${totalRequests} | ` +
            `Time: ${Reporter.formatDuration(elapsed)}`
        );

        if (elapsed >= CONFIG.benchmarkDuration) {
          isRunning = false;
          clearInterval(requestTimer);
          clearInterval(progressTimer);
        }
      }, 500);

      // Wait for benchmark completion
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isRunning) {
            clearInterval(checkInterval);
            resolve(undefined);
          }
        }, 100);
      });

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
      Reporter.printMetrics(testMetrics, `${targetRPS} RPS Results`);

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

    // Generate comprehensive benchmark report
    console.log('\n' + '═'.repeat(80));
    console.log(' BENCHMARK SUMMARY');
    console.log('═'.repeat(80));

    // Performance scaling analysis
    console.log('\nPerformance Scaling');
    console.log('─'.repeat(80));
    console.log('RPS\tThroughput\tP50\t\tP95\t\tP99\t\tErrors\t\tMemory');
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
    };

    await Bun.write('benchmark-results.json', JSON.stringify(benchmarkData, null, 2));

    console.log('\nDetailed results saved to benchmark-results.json');

    // Final verdict
    console.log('\n' + '═'.repeat(80));
    console.log('Benchmark suite completed successfully');
    console.log('═'.repeat(80));
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  } finally {
    server?.stop();
  }
}

// Run if executed directly
if (import.meta.main) {
  runBenchmark();
}
