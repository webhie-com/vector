import testServer from './test-server';

const port = Number(process.env.PORT || 3004);

const server = await testServer.serve({
  port,
  hostname: '0.0.0.0',
  development: false,
});

// Signal readiness to parent
process.stdout.write('READY\n');

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
