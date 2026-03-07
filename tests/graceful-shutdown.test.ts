import { describe, expect, it } from 'bun:test';
import { installGracefulShutdownHandlers } from '../src/cli/graceful-shutdown';

type SignalEvent = 'SIGINT' | 'SIGTERM';

function createSignalBus() {
  const listeners: Record<SignalEvent, Array<() => void>> = {
    SIGINT: [],
    SIGTERM: [],
  };

  return {
    on(event: SignalEvent, listener: () => void) {
      listeners[event].push(listener);
    },
    off(event: SignalEvent, listener: () => void) {
      listeners[event] = listeners[event].filter((item) => item !== listener);
    },
    emit(event: SignalEvent) {
      for (const listener of listeners[event]) {
        listener();
      }
    },
  };
}

describe('graceful shutdown handlers', () => {
  it('calls shutdown and exits with code 0 on SIGTERM', async () => {
    const bus = createSignalBus();
    let shutdownCalled = false;
    const exitCodes: number[] = [];

    installGracefulShutdownHandlers({
      getTarget: () => ({
        shutdown: async () => {
          shutdownCalled = true;
        },
      }),
      on: bus.on,
      off: bus.off,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    bus.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(shutdownCalled).toBe(true);
    expect(exitCodes).toEqual([0]);
  });

  it('falls back to stop when shutdown is not available', async () => {
    const bus = createSignalBus();
    let stopCalled = false;
    const exitCodes: number[] = [];

    installGracefulShutdownHandlers({
      getTarget: () => ({
        stop: () => {
          stopCalled = true;
        },
      }),
      on: bus.on,
      off: bus.off,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    bus.emit('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stopCalled).toBe(true);
    expect(exitCodes).toEqual([0]);
  });

  it('exits with code 1 when shutdown throws', async () => {
    const bus = createSignalBus();
    const exitCodes: number[] = [];
    const logs: string[] = [];

    installGracefulShutdownHandlers({
      getTarget: () => ({
        shutdown: async () => {
          throw new Error('boom');
        },
      }),
      on: bus.on,
      off: bus.off,
      exit: (code) => {
        exitCodes.push(code);
      },
      logError: (...args) => {
        logs.push(args.map(String).join(' '));
      },
    });

    bus.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exitCodes).toEqual([1]);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('handles duplicate signals only once', async () => {
    const bus = createSignalBus();
    let shutdownCalls = 0;
    const exitCodes: number[] = [];

    installGracefulShutdownHandlers({
      getTarget: () => ({
        shutdown: async () => {
          shutdownCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
      }),
      on: bus.on,
      off: bus.off,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    bus.emit('SIGTERM');
    bus.emit('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(shutdownCalls).toBe(1);
    expect(exitCodes).toEqual([0]);
  });
});
