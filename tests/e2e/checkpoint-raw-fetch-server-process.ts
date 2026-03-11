import { startVector } from '../../src/start-vector';

const port = Number(process.env.PORT ?? 3015);
const hostname = process.env.HOSTNAME ?? '127.0.0.1';
const routesDir = process.env.ROUTES_DIR;
const storageDir = process.env.CHECKPOINT_STORAGE_DIR;
const versionHeader = process.env.CHECKPOINT_VERSION_HEADER ?? 'x-vector-checkpoint-version';

if (!routesDir || !storageDir) {
  console.error('ROUTES_DIR and CHECKPOINT_STORAGE_DIR are required');
  process.exit(1);
}

const app = await startVector({
  autoDiscover: true,
  config: {
    port,
    hostname,
    development: false,
    routesDir,
    checkpoint: {
      enabled: true,
      storageDir,
      versionHeader,
      cacheKeyOverride: true,
      idleTimeoutMs: 600000,
    },
  },
});

process.stdout.write('READY\n');

const shutdown = async () => {
  try {
    await app.shutdown();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
