import type { MemoryMetrics, Metrics } from './metrics';

export class Reporter {
  static printMetrics(metrics: Metrics, title = 'Performance Metrics'): void {
    console.log('\n' + '─'.repeat(60));
    console.log(` ${title}`);
    console.log('─'.repeat(60));

    console.log('\n Summary');
    console.log(`  Requests:   ${metrics.totalRequests} total`);
    console.log(
      `  Success:    ${metrics.successfulRequests} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%)`
    );
    console.log(`  Failed:     ${metrics.failedRequests} (${metrics.errorRate.toFixed(1)}%)`);
    console.log(`  Duration:   ${(metrics.duration / 1000).toFixed(2)}s`);

    console.log('\n Response Times');
    console.log(`  Average:    ${metrics.averageResponseTime.toFixed(0)}ms`);
    console.log(
      `  Min/Max:    ${metrics.minResponseTime.toFixed(0)}ms / ${metrics.maxResponseTime.toFixed(0)}ms`
    );

    console.log('\n Percentiles');
    console.log(`  P50:        ${metrics.percentiles.p50.toFixed(0)}ms`);
    console.log(`  P90:        ${metrics.percentiles.p90.toFixed(0)}ms`);
    console.log(`  P95:        ${metrics.percentiles.p95.toFixed(0)}ms`);
    console.log(`  P99:        ${metrics.percentiles.p99.toFixed(0)}ms`);

    console.log('\n Throughput');
    console.log(`  Rate:       ${metrics.throughput.toFixed(1)} req/s`);

    console.log('─'.repeat(60));
  }

  static printMemoryMetrics(
    metrics: { average: MemoryMetrics; max: MemoryMetrics; growth: number },
    title = 'Memory Usage'
  ): void {
    console.log('\n' + '─'.repeat(60));
    console.log(` ${title}`);
    console.log('─'.repeat(60));

    console.log('\n Average');
    console.log(`  RSS:        ${(metrics.average.rss / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Heap Used:  ${(metrics.average.heapUsed / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Heap Total: ${(metrics.average.heapTotal / 1024 / 1024).toFixed(1)} MB`);

    console.log('\n Maximum');
    console.log(`  RSS:        ${(metrics.max.rss / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Heap Used:  ${(metrics.max.heapUsed / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Heap Total: ${(metrics.max.heapTotal / 1024 / 1024).toFixed(1)} MB`);

    console.log('\n Growth');
    console.log(`  Heap:       ${metrics.growth > 0 ? '+' : ''}${metrics.growth.toFixed(1)}%`);

    if (metrics.growth > 10) {
      console.log(`  Status:     ⚠ Warning - significant growth`);
    } else {
      console.log(`  Status:     ✓ Stable`);
    }

    console.log('─'.repeat(60));
  }

  static printStatusCodeDistribution(distribution: Record<string, number>): void {
    console.log('\n Status Codes');

    Object.entries(distribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([code, count]) => {
        const marker = code.startsWith('2')
          ? '✓'
          : code.startsWith('4')
            ? '!'
            : code.startsWith('5')
              ? '✗'
              : '•';
        console.log(`  ${marker} ${code.padEnd(6)} ${count}`);
      });
  }

  static printErrorSummary(errors: Record<string, number>): void {
    if (Object.keys(errors).length === 0) {
      console.log('\n ✓ No errors encountered');
      return;
    }

    console.log('\n Errors');
    Object.entries(errors).forEach(([message, count]) => {
      console.log(`  • ${message}: ${count}`);
    });
  }

  static printBenchmarkComparison(
    current: Metrics,
    baseline?: Metrics,
    title = 'Benchmark Comparison'
  ): void {
    console.log('\n' + '═'.repeat(60));
    console.log(`🏁 ${title}`);
    console.log('═'.repeat(60));

    Reporter.printMetrics(current, 'Current Run');

    if (baseline) {
      console.log('\n📊 Comparison with Baseline:');

      const throughputDiff =
        ((current.throughput - baseline.throughput) / baseline.throughput) * 100;
      const avgTimeDiff =
        ((current.averageResponseTime - baseline.averageResponseTime) /
          baseline.averageResponseTime) *
        100;
      const p95Diff =
        ((current.percentiles.p95 - baseline.percentiles.p95) / baseline.percentiles.p95) * 100;

      console.log(`  Throughput: ${Reporter.formatDiff(throughputDiff, true)}`);
      console.log(`  Avg Response Time: ${Reporter.formatDiff(avgTimeDiff, false)}`);
      console.log(`  P95 Response Time: ${Reporter.formatDiff(p95Diff, false)}`);

      if (throughputDiff < -10 || avgTimeDiff > 20 || p95Diff > 20) {
        console.log('\n⚠️  Performance regression detected!');
      } else if (throughputDiff > 10 && avgTimeDiff < -10) {
        console.log('\n✅ Performance improvement detected!');
      } else {
        console.log('\n✅ Performance is stable');
      }
    }

    console.log('═'.repeat(60));
  }

  private static formatDiff(percentage: number, higherIsBetter: boolean): string {
    const sign = percentage > 0 ? '+' : '';
    const emoji =
      (higherIsBetter && percentage > 0) || (!higherIsBetter && percentage < 0)
        ? '✅'
        : (higherIsBetter && percentage < -10) || (!higherIsBetter && percentage > 10)
          ? '❌'
          : '➖';

    return `${sign}${percentage.toFixed(2)}% ${emoji}`;
  }

  static printProgress(current: number, total: number, label = 'Progress'): void {
    const percentage = (current / total) * 100;
    const barLength = 40;
    const filled = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    process.stdout.write(`\r${label}: [${bar}] ${percentage.toFixed(1)}% (${current}/${total})`);

    if (current === total) {
      console.log(' ✅');
    }
  }

  static printTestHeader(name: string, description?: string): void {
    console.log('\n' + '═'.repeat(60));
    console.log(` ${name}`);
    if (description) {
      console.log(` ${description}`);
    }
    console.log('═'.repeat(60));
  }

  static printTestResult(passed: boolean, message: string): void {
    const marker = passed ? '✓' : '✗';
    const prefix = passed ? 'PASS' : 'FAIL';
    console.log(`  ${marker} ${message}`);
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  }
}
