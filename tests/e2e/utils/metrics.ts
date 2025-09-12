export interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: number;
  errorRate: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export class MetricsCollector {
  private responseTimes: number[] = [];
  private statusCodes: number[] = [];
  private errors: Error[] = [];
  private startTime = 0;
  private endTime = 0;

  start(): void {
    this.startTime = Date.now();
    this.responseTimes = [];
    this.statusCodes = [];
    this.errors = [];
  }

  stop(): void {
    this.endTime = Date.now();
  }

  recordResponse(time: number, status: number): void {
    this.responseTimes.push(time);
    this.statusCodes.push(status);
  }

  recordError(error: Error): void {
    this.errors.push(error);
    this.statusCodes.push(0);
  }

  getMetrics(): Metrics {
    const duration = (this.endTime || Date.now()) - this.startTime;
    const totalRequests = this.statusCodes.length;
    const successfulRequests = this.statusCodes.filter((code) => code >= 200 && code < 400).length;
    const failedRequests = totalRequests - successfulRequests;

    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: this.calculateAverage(this.responseTimes),
      minResponseTime: Math.min(...this.responseTimes) || 0,
      maxResponseTime: Math.max(...this.responseTimes) || 0,
      percentiles: {
        p50: this.calculatePercentile(sortedTimes, 50),
        p90: this.calculatePercentile(sortedTimes, 90),
        p95: this.calculatePercentile(sortedTimes, 95),
        p99: this.calculatePercentile(sortedTimes, 99),
      },
      throughput: totalRequests / (duration / 1000),
      errorRate: (failedRequests / totalRequests) * 100,
      startTime: this.startTime,
      endTime: this.endTime,
      duration,
    };
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  getStatusCodeDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    this.statusCodes.forEach((code) => {
      const key = code === 0 ? 'error' : code.toString();
      distribution[key] = (distribution[key] || 0) + 1;
    });

    return distribution;
  }

  getErrorSummary(): Record<string, number> {
    const summary: Record<string, number> = {};

    this.errors.forEach((error) => {
      const key = error.message || 'Unknown error';
      summary[key] = (summary[key] || 0) + 1;
    });

    return summary;
  }
}

// Memory monitoring
export interface MemoryMetrics {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  timestamp: number;
}

export class MemoryMonitor {
  private samples: MemoryMetrics[] = [];
  private interval: Timer | null = null;

  start(sampleInterval = 1000): void {
    this.samples = [];
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      this.samples.push({
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        timestamp: Date.now(),
      });
    }, sampleInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getMetrics(): {
    samples: MemoryMetrics[];
    average: MemoryMetrics;
    max: MemoryMetrics;
    growth: number;
  } {
    if (this.samples.length === 0) {
      const empty = { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, timestamp: 0 };
      return { samples: [], average: empty, max: empty, growth: 0 };
    }

    const average = {
      rss: this.calculateAverage(this.samples.map((s) => s.rss)),
      heapTotal: this.calculateAverage(this.samples.map((s) => s.heapTotal)),
      heapUsed: this.calculateAverage(this.samples.map((s) => s.heapUsed)),
      external: this.calculateAverage(this.samples.map((s) => s.external)),
      timestamp: Date.now(),
    };

    const max = {
      rss: Math.max(...this.samples.map((s) => s.rss)),
      heapTotal: Math.max(...this.samples.map((s) => s.heapTotal)),
      heapUsed: Math.max(...this.samples.map((s) => s.heapUsed)),
      external: Math.max(...this.samples.map((s) => s.external)),
      timestamp: Date.now(),
    };

    // More accurate growth calculation: skip initial warmup samples
    // and use median of middle samples vs end samples
    let growth = 0;
    if (this.samples.length >= 10) {
      const skipWarmup = Math.floor(this.samples.length * 0.2); // Skip first 20%
      const midPoint = Math.floor(this.samples.length / 2);

      const earlysamples = this.samples.slice(skipWarmup, midPoint);
      const lateSamples = this.samples.slice(midPoint);

      const earlyMedian = this.calculateMedian(earlysamples.map((s) => s.heapUsed));
      const lateMedian = this.calculateMedian(lateSamples.map((s) => s.heapUsed));

      if (earlyMedian > 0) {
        growth = ((lateMedian - earlyMedian) / earlyMedian) * 100;
      }
    }

    return { samples: this.samples, average, max, growth };
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  hasMemoryLeak(threshold = 10): boolean {
    if (this.samples.length < 10) return false;

    const { growth } = this.getMetrics();
    return growth > threshold;
  }
}

// CPU monitoring
export class CPUMonitor {
  private startUsage: NodeJS.CpuUsage | null = null;
  private samples: number[] = [];

  start(): void {
    this.startUsage = process.cpuUsage();
    this.samples = [];
  }

  sample(): void {
    if (!this.startUsage) return;

    const usage = process.cpuUsage(this.startUsage);
    const total = (usage.user + usage.system) / 1000; // Convert to ms
    this.samples.push(total);
  }

  getMetrics(): {
    totalCPUTime: number;
    averageCPUTime: number;
    samples: number[];
  } {
    const totalCPUTime = this.samples.reduce((sum, val) => sum + val, 0);
    const averageCPUTime = this.samples.length > 0 ? totalCPUTime / this.samples.length : 0;

    return {
      totalCPUTime,
      averageCPUTime,
      samples: this.samples,
    };
  }
}
