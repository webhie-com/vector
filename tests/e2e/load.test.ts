import type { Server } from 'bun';
import testServer from './test-server';
import { concurrentRequests, createClient } from './utils/http-client';
import { MemoryMonitor, MetricsCollector } from './utils/metrics';
import { Reporter } from './utils/reporter';

// Load test configuration
const CONFIG = {
  port: 3002,
  baseUrl: 'http://localhost:3002',
  warmupRequests: 10,
  testScenarios: [
    { name: 'Light Load', concurrent: 10, total: 100 },
    { name: 'Medium Load', concurrent: 50, total: 500 },
    { name: 'Heavy Load', concurrent: 100, total: 1000 },
    { name: 'Stress Test', concurrent: 200, total: 2000 },
  ],
};

async function runLoadTest() {
  Reporter.printTestHeader(
    'Load Testing Suite',
    'Testing server performance under various load conditions'
  );

  let server: Server;
  const client = createClient(CONFIG.baseUrl);

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

    // Warmup
    console.log('\nRunning warmup requests...');
    for (let i = 0; i < CONFIG.warmupRequests; i++) {
      await client.get('/health');
    }

    // Run test scenarios
    for (const scenario of CONFIG.testScenarios) {
      Reporter.printTestHeader(
        scenario.name,
        `${scenario.concurrent} concurrent, ${scenario.total} total requests`
      );

      const metrics = new MetricsCollector();
      const memoryMonitor = new MemoryMonitor();

      // Prepare requests
      const requests = Array(scenario.total)
        .fill(null)
        .map((_, i) => {
          // Mix of different endpoints
          const endpoints = [
            { path: '/health', weight: 3 },
            { path: '/api/products', weight: 5 },
            { path: '/api/products/1', weight: 3 },
            { path: '/api/compute?iterations=100', weight: 1 },
            { path: '/api/metrics', weight: 2 },
          ];

          // Weighted random selection
          const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
          let random = Math.random() * totalWeight;
          let selected = endpoints[0];

          for (const endpoint of endpoints) {
            random -= endpoint.weight;
            if (random <= 0) {
              selected = endpoint;
              break;
            }
          }

          return { path: selected.path };
        });

      // Start monitoring
      metrics.start();
      memoryMonitor.start(500);

      // Execute concurrent requests
      console.log(
        `\nExecuting ${scenario.total} requests with ${scenario.concurrent} concurrent connections...`
      );

      const startTime = Date.now();
      let completed = 0;
      const batchSize = scenario.concurrent;

      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, Math.min(i + batchSize, requests.length));

        const responses = await concurrentRequests(client, batch, scenario.concurrent);

        responses.forEach((response) => {
          if (response.status > 0) {
            metrics.recordResponse(response.time, response.status);
          } else {
            metrics.recordError(new Error(response.data?.error || 'Unknown error'));
          }
        });

        completed += batch.length;
        Reporter.printProgress(completed, scenario.total, 'Requests');
      }

      const duration = Date.now() - startTime;

      // Stop monitoring
      metrics.stop();
      memoryMonitor.stop();

      // Report results
      const testMetrics = metrics.getMetrics();
      const memoryMetrics = memoryMonitor.getMetrics();
      const statusDistribution = metrics.getStatusCodeDistribution();
      const errorSummary = metrics.getErrorSummary();

      Reporter.printMetrics(testMetrics, `${scenario.name} Results`);
      Reporter.printStatusCodeDistribution(statusDistribution);
      Reporter.printErrorSummary(errorSummary);
      Reporter.printMemoryMetrics(memoryMetrics, 'Memory Usage During Test');

      // Performance assertions
      console.log('\nPerformance Checks:');

      const checks = [
        {
          name: 'Error Rate < 5%',
          passed: testMetrics.errorRate < 5,
          actual: `${testMetrics.errorRate.toFixed(2)}%`,
        },
        {
          name: 'P95 Response Time < 1000ms',
          passed: testMetrics.percentiles.p95 < 1000,
          actual: `${testMetrics.percentiles.p95.toFixed(2)}ms`,
        },
        {
          name: 'Throughput > 50 req/s',
          passed: testMetrics.throughput > 50,
          actual: `${testMetrics.throughput.toFixed(2)} req/s`,
        },
        {
          name: 'No Memory Leak',
          passed: !memoryMonitor.hasMemoryLeak(20),
          actual: `${memoryMetrics.growth.toFixed(2)}% growth`,
        },
      ];

      checks.forEach((check) => {
        Reporter.printTestResult(check.passed, `${check.name} (actual: ${check.actual})`);
      });

      // Cool down between scenarios
      if (scenario !== CONFIG.testScenarios[CONFIG.testScenarios.length - 1]) {
        console.log('\n⏳ Cooling down before next scenario...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('Load testing completed successfully');
    console.log('─'.repeat(60));
  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  } finally {
    server?.stop();
  }
}

// Run if executed directly
if (import.meta.main) {
  runLoadTest();
}
