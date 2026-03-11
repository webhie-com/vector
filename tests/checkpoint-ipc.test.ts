import { describe, it, expect } from 'bun:test';
import { parseIpcLine, waitForReady } from '../src/checkpoint/ipc';

describe('parseIpcLine', () => {
  it('parses READY signal', () => {
    const msg = parseIpcLine('READY');
    expect(msg).toEqual({ type: 'ready' });
  });

  it('parses READY with whitespace', () => {
    const msg = parseIpcLine('  READY  ');
    expect(msg).toEqual({ type: 'ready' });
  });

  it('parses JSON error message', () => {
    const msg = parseIpcLine('{"type":"error","message":"something broke"}');
    expect(msg).toEqual({ type: 'error', message: 'something broke' });
  });

  it('parses JSON health message', () => {
    const msg = parseIpcLine('{"type":"health","status":"ok"}');
    expect(msg).toEqual({ type: 'health', status: 'ok' });
  });

  it('returns null for empty string', () => {
    expect(parseIpcLine('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseIpcLine('   ')).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseIpcLine('some random log output')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseIpcLine('{invalid json}')).toBeNull();
  });
});

describe('waitForReady', () => {
  it('resolves when READY is received', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('READY\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).resolves.toBeUndefined();
  });

  it('resolves when READY appears after other output', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Loading...\nInitializing...\nREADY\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).resolves.toBeUndefined();
  });

  it('rejects on timeout', async () => {
    const stream = new ReadableStream({
      start(_controller) {
        // Never send READY — stream stays open
      },
    });

    await expect(waitForReady(stream, 100)).rejects.toThrow('did not become ready');
  });

  it('rejects when stream closes without READY', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('some output\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).rejects.toThrow('closed before READY');
  });

  it('rejects on error IPC message', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"error","message":"startup failed"}\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).rejects.toThrow('startup failed');
  });

  it('handles chunked READY signal', async () => {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('REA'));
        // Small delay to simulate chunking
        await new Promise((r) => setTimeout(r, 10));
        controller.enqueue(new TextEncoder().encode('DY\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).resolves.toBeUndefined();
  });

  it('resolves when READY arrives without trailing newline before close', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('READY'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).resolves.toBeUndefined();
  });

  it('ignores non-error JSON messages before READY', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"health","status":"ok"}\nREADY\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1000)).resolves.toBeUndefined();
  });

  it('rejects with very short timeout', async () => {
    const stream = new ReadableStream({
      async start(controller) {
        await new Promise((r) => setTimeout(r, 200));
        controller.enqueue(new TextEncoder().encode('READY\n'));
        controller.close();
      },
    });

    await expect(waitForReady(stream, 1)).rejects.toThrow('did not become ready');
  });

  it('rejects when startup output grows beyond the pending buffer guard', async () => {
    const oversizedLine = 'x'.repeat(1_048_577);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversizedLine));
      },
    });

    await expect(waitForReady(stream, 1000)).rejects.toThrow('stdout exceeded 1048576 chars before READY');
  });
});
