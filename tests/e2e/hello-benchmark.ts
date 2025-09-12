import type { Server } from 'bun';
import testServer from './test-server';
import { createClient } from './utils/http-client';

async function benchmarkHelloWorld() {
  console.log('🚀 Hello World Benchmark');
  console.log('Testing raw throughput of simple GET /health endpoint\n');

  let server: Server;
  const client = createClient('http://localhost:3005');

  try {
    // Start server
    server = await testServer.serve({
      port: 3005,
      hostname: '0.0.0.0',
      development: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Warmup
    console.log('Warming up...');
    for (let i = 0; i < 100; i++) {
      await client.get('/health');
    }

    // Test different concurrency levels
    const tests = [
      { concurrent: 1, requests: 1000 },
      { concurrent: 10, requests: 5000 },
      { concurrent: 50, requests: 10000 },
      { concurrent: 100, requests: 20000 },
      { concurrent: 200, requests: 30000 },
    ];

    for (const test of tests) {
      console.log(`\nTesting ${test.concurrent} concurrent connections...`);

      const start = Date.now();
      let completed = 0;

      // Create batches
      const batchSize = test.concurrent;
      const batches = Math.ceil(test.requests / batchSize);

      for (let i = 0; i < batches; i++) {
        const promises = [];
        const currentBatchSize = Math.min(batchSize, test.requests - completed);

        for (let j = 0; j < currentBatchSize; j++) {
          promises.push(client.get('/health'));
        }

        await Promise.all(promises);
        completed += currentBatchSize;

        // Progress
        if (i % 10 === 0) {
          process.stdout.write(`\r  Progress: ${completed}/${test.requests}`);
        }
      }

      const duration = Date.now() - start;
      const rps = (test.requests / duration) * 1000;

      console.log(`\r  ✅ Completed: ${test.requests} requests in ${duration}ms`);
      console.log(`  📊 Throughput: ${rps.toFixed(0)} req/s`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Benchmark complete!');
  } finally {
    server?.stop();
  }
}

if (import.meta.main) {
  benchmarkHelloWorld();
}
