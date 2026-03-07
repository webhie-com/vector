type SignalEvent = 'SIGINT' | 'SIGTERM';

interface ShutdownTarget {
  shutdown?: () => Promise<void> | void;
  stop?: () => void;
}

interface GracefulShutdownOptions {
  getTarget: () => ShutdownTarget | null | undefined;
  on?: (event: SignalEvent, listener: () => void) => void;
  off?: (event: SignalEvent, listener: () => void) => void;
  exit?: (code: number) => void;
  logError?: (message?: any, ...optionalParams: any[]) => void;
}

export function installGracefulShutdownHandlers(options: GracefulShutdownOptions): () => void {
  const on = options.on ?? ((event: SignalEvent, listener: () => void) => process.on(event, listener));
  const off = options.off ?? ((event: SignalEvent, listener: () => void) => process.off(event, listener));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const logError = options.logError ?? console.error;
  let shuttingDown = false;

  const handleSignal = async (signal: SignalEvent): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    try {
      const target = options.getTarget();
      if (target) {
        if (typeof target.shutdown === 'function') {
          await target.shutdown();
        } else if (typeof target.stop === 'function') {
          target.stop();
        }
      }
      exit(0);
    } catch (error) {
      logError(`[vector] Graceful shutdown failed after ${signal}:`, error);
      exit(1);
    }
  };

  const onSigint = () => {
    void handleSignal('SIGINT');
  };

  const onSigterm = () => {
    void handleSignal('SIGTERM');
  };

  on('SIGINT', onSigint);
  on('SIGTERM', onSigterm);

  return () => {
    off('SIGINT', onSigint);
    off('SIGTERM', onSigterm);
  };
}
