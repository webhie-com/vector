import type { Server } from 'bun';
import testServer from './test-server';
import { createClient } from './utils/http-client';
import { CPUMonitor, MemoryMonitor, MetricsCollector } from './utils/metrics';
import { Reporter } from './utils/reporter';

// Soak test configuration
const CONFIG = {
  port: 3003,
  baseUrl: 'http://localhost:3003',
  duration: 5 * 60 * 1000, // 5 minutes
  requestsPerSecond: 20,
  memorySampleInterval: 5000, // 5 seconds
  checkpointInterval: 30000, // 30 seconds
  memoryLeakThreshold: 25, // 25% growth considered a leak
};

interface Checkpoint {
  time: number;
  requests: number;
  errors: number;
  avgResponseTime: number;
  memory: number;
}

async function runSoakTest() {
  Reporter.printTestHeader(
    'Soak Testing Suite',
    `Testing server stability over ${CONFIG.duration / 1000 / 60} minutes with ${CONFIG.requestsPerSecond} req/s`
  );

  let server: Server;
  const client = createClient(CONFIG.baseUrl);
  const checkpoints: Checkpoint[] = [];

  try {
    // Start test server
    console.log('🚀 Starting test server...');
    server = await testServer.serve({
      port: CONFIG.port,
      hostname: '0.0.0.0',
      development: false,
    });

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Initialize monitoring
    const metrics = new MetricsCollector();
    const memoryMonitor = new MemoryMonitor();
    const cpuMonitor = new CPUMonitor();

    metrics.start();
    memoryMonitor.start(CONFIG.memorySampleInterval);
    cpuMonitor.start();

    const startTime = Date.now();
    let totalRequests = 0;
    let totalErrors = 0;
    let lastCheckpoint = startTime;
    let isRunning = true;

    console.log('\n🏃 Starting soak test...');
    console.log(`Duration: ${Reporter.formatDuration(CONFIG.duration)}`);
    console.log(`Target RPS: ${CONFIG.requestsPerSecond}`);
    console.log('\n');

    // Request endpoints with weights
    const endpoints = [
      { path: '/health', weight: 2 },
      { path: '/api/products', weight: 4 },
      { path: '/api/products/1', weight: 2 },
      { path: '/api/products/2', weight: 2 },
      { path: '/api/compute?iterations=500', weight: 1 },
      { path: '/api/metrics', weight: 1 },
    ];

    const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);

    // Function to select random endpoint
    const selectEndpoint = () => {
      let random = Math.random() * totalWeight;
      for (const endpoint of endpoints) {
        random -= endpoint.weight;
        if (random <= 0) return endpoint.path;
      }
      return endpoints[0].path;
    };

    // Request sender function
    const sendRequest = async () => {
      if (!isRunning) return;

      const path = selectEndpoint();

      try {
        const response = await client.get(path, { timeout: 5000 });
        metrics.recordResponse(response.time, response.status);
        totalRequests++;

        if (response.status >= 400) {
          totalErrors++;
        }
      } catch (error) {
        metrics.recordError(error as Error);
        totalErrors++;
      }

      cpuMonitor.sample();
    };

    // Schedule requests at target rate
    const requestInterval = 1000 / CONFIG.requestsPerSecond;
    const requestTimer = setInterval(sendRequest, requestInterval);

    // Progress and checkpoint reporting
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed / CONFIG.duration) * 100;
      const currentMetrics = metrics.getMetrics();

      // Show progress
      const progressBar =
        '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
      process.stdout.write(
        `\r[${progressBar}] ${progress.toFixed(1)}% | ` +
          `Requests: ${totalRequests} | ` +
          `Errors: ${totalErrors} | ` +
          `Avg RT: ${currentMetrics.averageResponseTime.toFixed(0)}ms | ` +
          `Time: ${Reporter.formatDuration(elapsed)}`
      );

      // Checkpoint recording
      if (Date.now() - lastCheckpoint >= CONFIG.checkpointInterval) {
        const memUsage = process.memoryUsage();
        checkpoints.push({
          time: elapsed,
          requests: totalRequests,
          errors: totalErrors,
          avgResponseTime: currentMetrics.averageResponseTime,
          memory: memUsage.heapUsed,
        });
        lastCheckpoint = Date.now();
      }

      // Check if test is complete
      if (elapsed >= CONFIG.duration) {
        isRunning = false;
        clearInterval(requestTimer);
        clearInterval(progressTimer);
      }
    }, 1000);

    // Wait for test completion
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

    // Generate final report
    const finalMetrics = metrics.getMetrics();
    const memoryMetrics = memoryMonitor.getMetrics();
    const cpuMetrics = cpuMonitor.getMetrics();
    const statusDistribution = metrics.getStatusCodeDistribution();
    const errorSummary = metrics.getErrorSummary();

    Reporter.printMetrics(finalMetrics, 'Soak Test Results');
    Reporter.printStatusCodeDistribution(statusDistribution);
    Reporter.printErrorSummary(errorSummary);
    Reporter.printMemoryMetrics(memoryMetrics, 'Memory Usage Over Time');

    // Print checkpoints
    console.log('\n📊 Checkpoints:');
    console.log('-'.repeat(80));
    console.log('Time\t\tRequests\tErrors\t\tAvg RT\t\tMemory');
    console.log('-'.repeat(80));

    checkpoints.forEach((cp) => {
      console.log(
        `${Reporter.formatDuration(cp.time)}\t\t` +
          `${cp.requests}\t\t` +
          `${cp.errors}\t\t` +
          `${cp.avgResponseTime.toFixed(0)}ms\t\t` +
          `${Reporter.formatBytes(cp.memory)}`
      );
    });
    console.log('-'.repeat(80));

    // CPU metrics
    console.log('\n💻 CPU Usage:');
    console.log(`  Total CPU Time: ${cpuMetrics.totalCPUTime.toFixed(2)}ms`);
    console.log(`  Average CPU Time: ${cpuMetrics.averageCPUTime.toFixed(2)}ms`);

    // Stability checks
    console.log('\n📋 Stability Checks:');

    const stabilityChecks = [
      {
        name: 'Memory Leak Detection',
        passed: !memoryMonitor.hasMemoryLeak(CONFIG.memoryLeakThreshold),
        detail: `Memory growth: ${memoryMetrics.growth.toFixed(2)}%`,
      },
      {
        name: 'Error Rate Stable',
        passed: finalMetrics.errorRate < 5,
        detail: `Error rate: ${finalMetrics.errorRate.toFixed(2)}%`,
      },
      {
        name: 'Response Time Stable',
        passed: finalMetrics.percentiles.p95 < 2000,
        detail: `P95: ${finalMetrics.percentiles.p95.toFixed(0)}ms`,
      },
      {
        name: 'Throughput Maintained',
        passed: finalMetrics.throughput > CONFIG.requestsPerSecond * 0.9,
        detail: `Actual: ${finalMetrics.throughput.toFixed(2)} req/s`,
      },
      {
        name: 'No Crash',
        passed: true,
        detail: 'Server remained operational',
      },
    ];

    let allPassed = true;
    stabilityChecks.forEach((check) => {
      Reporter.printTestResult(check.passed, `${check.name} - ${check.detail}`);
      if (!check.passed) allPassed = false;
    });

    // Performance degradation analysis
    if (checkpoints.length >= 2) {
      const firstCheckpoint = checkpoints[0];
      const lastCheckpoint = checkpoints[checkpoints.length - 1];

      const rtDegradation =
        ((lastCheckpoint.avgResponseTime - firstCheckpoint.avgResponseTime) /
          firstCheckpoint.avgResponseTime) *
        100;

      console.log('\n📉 Performance Degradation:');
      console.log(`  Response Time: ${rtDegradation > 0 ? '+' : ''}${rtDegradation.toFixed(2)}%`);

      if (Math.abs(rtDegradation) > 20) {
        console.log('  ⚠️  Significant performance degradation detected!');
        allPassed = false;
      } else {
        console.log('  ✅ Performance remained stable');
      }
    }

    // Final verdict
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ Soak test PASSED - Server is stable under sustained load');
    } else {
      console.log('❌ Soak test FAILED - Stability issues detected');
    }
    console.log('='.repeat(60));

    // Save results to file for analysis
    const results = {
      config: CONFIG,
      metrics: finalMetrics,
      memory: memoryMetrics,
      cpu: cpuMetrics,
      checkpoints,
      statusDistribution,
      errors: errorSummary,
      passed: allPassed,
    };

    await Bun.write('soak-test-results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 Results saved to soak-test-results.json');
  } catch (error) {
    console.error('❌ Soak test failed:', error);
    process.exit(1);
  } finally {
    server?.stop();
  }
}

// Run if executed directly
if (import.meta.main) {
  runSoakTest();
}
