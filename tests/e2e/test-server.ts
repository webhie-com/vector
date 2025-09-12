import { APIError, createVector } from '../../src';
import type { VectorRequest } from '../../src/types';

// Simple in-memory database
const db = {
  users: new Map<string, any>(),
  products: [
    { id: 1, name: 'Laptop', price: 999, stock: 10 },
    { id: 2, name: 'Mouse', price: 29, stock: 100 },
    { id: 3, name: 'Keyboard', price: 79, stock: 50 },
  ],
  requestCount: 0,
  startTime: Date.now(),
};

// Create Vector instance
const vector = createVector();

// Configure authentication
vector.protected = async (request: VectorRequest): Promise<any> => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header');
  }

  const token = authHeader.substring(7);

  // Simple token validation (in real app, verify JWT)
  if (token === 'test-token-123') {
    return {
      id: 'user-1',
      email: 'test@example.com',
      role: 'admin',
    };
  }

  throw new Error('Invalid token');
};

// Request counting middleware
vector.before(async (request: VectorRequest) => {
  db.requestCount++;
  request.context = {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
  };
  return request;
});

// Response time header middleware
vector.finally(async (response: Response, request: VectorRequest) => {
  const duration = Date.now() - (request.context?.startTime || 0);
  const headers = new Headers(response.headers);
  headers.set('X-Response-Time', `${duration}ms`);
  headers.set('X-Request-Id', request.context?.requestId || 'unknown');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

// Health check endpoint
vector.route(
  {
    method: 'GET',
    path: '/health',
    expose: true,
  },
  async () => {
    const uptime = Date.now() - db.startTime;
    const memoryUsage = process.memoryUsage();

    return {
      status: 'healthy',
      uptime: Math.floor(uptime / 1000),
      requestCount: db.requestCount,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    };
  }
);

// Public products endpoint with caching
vector.route(
  {
    method: 'GET',
    path: '/api/products',
    expose: true,
    cache: 30, // Cache for 30 seconds
  },
  async (request: VectorRequest) => {
    return {
      products: db.products,
      total: db.products.length,
    };
  }
);

// Get single product
vector.route(
  {
    method: 'GET',
    path: '/api/products/:id',
    expose: true,
  },
  async (request: VectorRequest) => {
    const id = Number.parseInt(request.params?.id || '0');
    const product = db.products.find((p) => p.id === id);

    if (!product) {
      throw APIError.notFound('Product not found');
    }

    return product;
  }
);

// Protected user endpoint
vector.route(
  {
    method: 'GET',
    path: '/api/user',
    auth: true,
    expose: true,
  },
  async (request: VectorRequest) => {
    return {
      user: request.authUser,
      requestId: request.context?.requestId,
    };
  }
);

// Protected data creation endpoint
vector.route(
  {
    method: 'POST',
    path: '/api/data',
    auth: true,
    expose: true,
  },
  async (request: VectorRequest) => {
    const data = request.content;

    if (!data || !data.name) {
      throw APIError.badRequest('Name is required');
    }

    const id = crypto.randomUUID();
    db.users.set(id, { id, ...data, createdAt: new Date() });

    return {
      success: true,
      id,
      data: db.users.get(id),
    };
  }
);

// Heavy computation endpoint for stress testing
vector.route(
  {
    method: 'GET',
    path: '/api/compute',
    expose: true,
  },
  async (request: VectorRequest) => {
    const iterations = Number.parseInt(request.query?.iterations || '1000');
    const startTime = Date.now();

    // Optimized computation with yielding for large iterations
    let result = 0;
    const chunkSize = 1000;

    for (let i = 0; i < iterations; i += chunkSize) {
      const end = Math.min(i + chunkSize, iterations);
      for (let j = i; j < end; j++) {
        result += Math.sqrt(j) * Math.sin(j);
      }
      // Yield to event loop for large computations
      if (iterations > 10000 && i + chunkSize < iterations) {
        await Bun.sleep(0); // Bun's efficient yielding
      }
    }

    return {
      iterations,
      result,
      computeTime: Date.now() - startTime,
    };
  }
);

// Error simulation endpoint
vector.route(
  {
    method: 'GET',
    path: '/api/error',
    expose: true,
  },
  async (request: VectorRequest) => {
    const type = request.query?.type || 'bad-request';

    switch (type) {
      case 'bad-request':
        throw APIError.badRequest('Simulated bad request');
      case 'unauthorized':
        throw APIError.unauthorized('Simulated unauthorized');
      case 'forbidden':
        throw APIError.forbidden('Simulated forbidden');
      case 'not-found':
        throw APIError.notFound('Simulated not found');
      case 'conflict':
        throw APIError.conflict('Simulated conflict');
      case 'internal':
        throw APIError.internalServerError('Simulated internal error');
      case 'rate-limit':
        throw APIError.rateLimitExceeded('Simulated rate limit');
      default:
        throw new Error('Unknown error type');
    }
  }
);

// Slow endpoint for timeout testing
vector.route(
  {
    method: 'GET',
    path: '/api/slow',
    expose: true,
  },
  async (request: VectorRequest) => {
    const delay = Number.parseInt(request.query?.delay || '1000');
    await new Promise((resolve) => setTimeout(resolve, delay));

    return {
      message: 'Slow response',
      delay,
    };
  }
);

// Memory stress endpoint
vector.route(
  {
    method: 'GET',
    path: '/api/memory',
    expose: true,
  },
  async () => {
    const size = 1024 * 1024; // 1MB
    const arrays = [];

    // Allocate some memory
    for (let i = 0; i < 10; i++) {
      arrays.push(new Array(size).fill(Math.random()));
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    return {
      allocated: '10MB',
      memory: process.memoryUsage(),
    };
  }
);

// Metrics endpoint
vector.route(
  {
    method: 'GET',
    path: '/api/metrics',
    expose: true,
  },
  async () => {
    const uptime = Date.now() - db.startTime;
    const memoryUsage = process.memoryUsage();

    return {
      uptime: Math.floor(uptime / 1000),
      requests: {
        total: db.requestCount,
        perSecond: db.requestCount / (uptime / 1000),
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
      users: db.users.size,
      products: db.products.length,
    };
  }
);

// Reset endpoint for testing
vector.route(
  {
    method: 'POST',
    path: '/api/reset',
    expose: true,
  },
  async () => {
    db.users.clear();
    db.requestCount = 0;

    return {
      message: 'Test data reset',
      timestamp: new Date().toISOString(),
    };
  }
);

// Export the configured server
export default vector;

// Start server if run directly
if (import.meta.main) {
  const port = Number.parseInt(process.env.PORT || '3001');

  vector
    .serve({
      port,
      hostname: '0.0.0.0',
      development: false,
      autoDiscover: false, // Disable route discovery for test server
    })
    .then((server) => {
      console.log(`\nTest server ready at http://localhost:${port}\n`);
      console.log('Available endpoints:');
      console.log('  GET  /health           Health check');
      console.log('  GET  /api/products      List products (cached)');
      console.log('  GET  /api/products/:id  Get product');
      console.log('  GET  /api/user          Get user (auth required)');
      console.log('  POST /api/data          Create data (auth required)');
      console.log('  GET  /api/compute       Heavy computation');
      console.log('  GET  /api/error         Error simulation');
      console.log('  GET  /api/slow          Slow response');
      console.log('  GET  /api/memory        Memory stress');
      console.log('  GET  /api/metrics       Server metrics');
      console.log('  POST /api/reset         Reset test data\n');
    });
}
