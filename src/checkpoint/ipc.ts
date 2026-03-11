export type CheckpointIpcMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'health'; status: 'ok' | 'degraded' };

const MAX_PENDING_STDOUT_CHARS = 1_048_576; // 1 MiB guard against unbounded startup log lines.

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

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        reader.releaseLock();
      } catch {
        // Ignore release failures when the reader is already detached.
      }
      fn();
    }

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`Checkpoint process did not become ready within ${timeoutMs}ms`)));
    }, timeoutMs);

    const processLine = (line: string): 'ready' | 'error' | 'continue' => {
      const msg = parseIpcLine(line);
      if (msg?.type === 'ready') {
        settle(() => resolve());
        return 'ready';
      }
      if (msg?.type === 'error') {
        settle(() => reject(new Error(`Checkpoint process error: ${msg.message}`)));
        return 'error';
      }
      return 'continue';
    };

    const processBufferLines = (): 'ready' | 'error' | 'continue' => {
      let lineEnd = buffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        const result = processLine(line);
        if (result !== 'continue') {
          return result;
        }
        lineEnd = buffer.indexOf('\n');
      }
      return 'continue';
    };

    // Iterative read loop (not recursive) to avoid stack overflow on large stdout
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            buffer += decoder.decode();
            const lastLine = buffer.trim();
            if (lastLine.length > 0) {
              const result = processLine(lastLine);
              if (result !== 'continue') {
                return;
              }
            }
            settle(() => reject(new Error('Checkpoint process stdout closed before READY signal')));
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > MAX_PENDING_STDOUT_CHARS) {
            settle(() =>
              reject(new Error(`Checkpoint process stdout exceeded ${MAX_PENDING_STDOUT_CHARS} chars before READY`))
            );
            return;
          }

          const result = processBufferLines();
          if (result !== 'continue') {
            return;
          }
        }
      } catch (err) {
        settle(() => reject(err));
      }
    })();
  });
}
