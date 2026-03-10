export type CheckpointIpcMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'health'; status: 'ok' | 'degraded' };

export function parseIpcLine(line: string): CheckpointIpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed === 'READY') return { type: 'ready' };

  try {
    return JSON.parse(trimmed) as CheckpointIpcMessage;
  } catch {
    return null;
  }
}

export async function waitForReady(stdout: ReadableStream<Uint8Array>, timeoutMs: number = 10_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reader.releaseLock();
      reject(new Error(`Checkpoint process did not become ready within ${timeoutMs}ms`));
    }, timeoutMs);

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reader.releaseLock();
      fn();
    }

    // Iterative read loop (not recursive) to avoid stack overflow on large stdout
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            settle(() => reject(new Error('Checkpoint process stdout closed before READY signal')));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const msg = parseIpcLine(line);
            if (msg?.type === 'ready') {
              settle(() => resolve());
              return;
            }
            if (msg?.type === 'error') {
              settle(() => reject(new Error(`Checkpoint process error: ${msg.message}`)));
              return;
            }
          }
        }
      } catch (err) {
        settle(() => reject(err));
      }
    })();
  });
}
