import { route } from '../../src/index';

// Health check endpoint
export const healthCheck = route(
  {
    method: 'GET',
    path: '/health',
    expose: true,
    rawResponse: false,
  },
  async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
    };
  }
);

// Readiness check
export const readiness = route(
  {
    method: 'GET',
    path: '/ready',
    expose: true,
  },
  async () => {
    // Check database, cache, etc.
    const checks = {
      database: true,
      cache: true,
      api: true,
    };

    const allReady = Object.values(checks).every((v) => v === true);

    return {
      ready: allReady,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
);

// Metrics endpoint (protected)
export const metrics = route(
  {
    method: 'GET',
    path: '/metrics',
    expose: true,
    auth: true,
    responseContentType: 'text/plain',
  },
  async (req) => {
    // Return prometheus-style metrics
    return `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234
http_requests_total{method="POST",status="201"} 456

# HELP response_time_seconds Response time in seconds
# TYPE response_time_seconds histogram
response_time_seconds_bucket{le="0.1"} 1000
response_time_seconds_bucket{le="0.5"} 1200
response_time_seconds_bucket{le="1"} 1300
response_time_seconds_sum 567.89
response_time_seconds_count 1300

# User: ${req.authUser.id}
`;
  }
);
