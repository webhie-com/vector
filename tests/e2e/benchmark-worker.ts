// Bun Worker — runs concurrent fetch loops on its own event loop thread.
// Using raw fetch (no HttpClient wrapper) eliminates AbortController timer
// overhead, body-parse allocations, and object creation per request.

interface WorkerConfig {
  baseUrl: string;
  concurrency: number;
  duration: number;
  endpoints: string[];
}

export interface WorkerResult {
  total: number;
  success: number;
  failed: number;
  responseTimes: number[];
}

self.onmessage = async (event: MessageEvent<WorkerConfig>) => {
  const { baseUrl, concurrency, duration, endpoints } = event.data;

  const responseTimes: number[] = [];
  let total = 0;
  let success = 0;
  let failed = 0;
  let running = true;

  const stopTimer = setTimeout(() => {
    running = false;
  }, duration);

  let i = 0;
  const loops = Array.from({ length: concurrency }, async () => {
    while (running) {
      const url = `${baseUrl}${endpoints[i++ % endpoints.length]}`;
      const start = Date.now();
      try {
        const res = await fetch(url);
        // Drain the body so the connection returns to the pool promptly,
        // but skip full parsing — we only need status and timing.
        await res.arrayBuffer();
        responseTimes.push(Date.now() - start);
        if (res.status >= 200 && res.status < 400) success++;
        else failed++;
        total++;
      } catch {
        failed++;
        total++;
      }
    }
  });

  await Promise.all(loops);
  clearTimeout(stopTimer);

  self.postMessage({ total, success, failed, responseTimes } satisfies WorkerResult);
};
