import { route } from '../../src/index';

export const healthCheck = route({ method: 'GET', path: '/health' }, async () => {
  return {
    status: 'healthy',
    service: 'vector-example-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
});
