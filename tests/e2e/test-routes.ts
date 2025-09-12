import { route, APIError } from '../../src';
import type { VectorRequest } from '../../src/types';

// Mock data
const products = [
  { id: 1, name: 'Product 1', price: 29.99, category: 'Electronics' },
  { id: 2, name: 'Product 2', price: 49.99, category: 'Books' },
  { id: 3, name: 'Product 3', price: 19.99, category: 'Toys' },
];

const dataStore: any[] = [];
let requestCount = 0;
const serverStartTime = Date.now();

// Middleware to track requests
const trackRequest = () => {
  requestCount++;
};

// Products endpoints
export const listProducts = route(
  {
    method: 'GET',
    path: '/api/products',
    expose: true,
    cache: 5, // Cache for 5 seconds
  },
  async () => {
    trackRequest();
    // Simulate some processing time for first request
    if (requestCount === 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return {
      products,
      total: products.length,
      page: 1,
      pageSize: 10,
    };
  }
);

export const getProduct = route(
  {
    method: 'GET',
    path: '/api/products/:id',
    expose: true,
  },
  async (req: VectorRequest) => {
    trackRequest();
    const id = parseInt(req.params?.id as string);
    const product = products.find(p => p.id === id);
    
    if (!product) {
      throw APIError.notFound('Product not found');
    }
    
    return product;
  }
);

// Authentication endpoint
export const getUser = route(
  {
    method: 'GET',
    path: '/api/user',
    expose: true,
    auth: true,
  },
  async (req: VectorRequest) => {
    trackRequest();
    // The auth middleware should have already validated the token
    // and attached the user to the request
    return {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
      }
    };
  }
);

// Data creation endpoint
export const createData = route(
  {
    method: 'POST',
    path: '/api/data',
    expose: true,
    auth: true,
  },
  async (req: VectorRequest) => {
    trackRequest();
    const body = req.content as any;
    
    if (!body || !body.name) {
      throw APIError.badRequest('Name is required');
    }
    
    const newData = {
      id: dataStore.length + 1,
      name: body.name,
      value: body.value || 0,
      createdAt: new Date().toISOString(),
    };
    
    dataStore.push(newData);
    
    return {
      success: true,
      id: newData.id,
      data: newData,
    };
  }
);

// Error handling endpoint
export const testError = route(
  {
    method: 'GET',
    path: '/api/error',
    expose: true,
  },
  async (req: VectorRequest) => {
    trackRequest();
    const url = new URL(req.url);
    const errorType = url.searchParams.get('type');
    
    switch (errorType) {
      case 'bad-request':
        throw APIError.badRequest('Bad request error');
      case 'unauthorized':
        throw APIError.unauthorized('Unauthorized error');
      case 'forbidden':
        throw APIError.forbidden('Forbidden error');
      case 'not-found':
        throw APIError.notFound('Not found error');
      case 'conflict':
        throw APIError.conflict('Conflict error');
      case 'internal':
        throw APIError.internalServerError('Internal server error');
      case 'rate-limit':
        throw APIError.tooManyRequests('Rate limit exceeded');
      default:
        throw APIError.badRequest('Unknown error type');
    }
  }
);

// Compute-intensive endpoint
export const compute = route(
  {
    method: 'GET',
    path: '/api/compute',
    expose: true,
  },
  async (req: VectorRequest) => {
    trackRequest();
    const url = new URL(req.url);
    const iterations = parseInt(url.searchParams.get('iterations') || '1000');
    
    const startTime = Date.now();
    
    // Simulate compute-intensive work
    let result = 0;
    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(i);
    }
    
    const computeTime = Date.now() - startTime;
    
    return {
      iterations,
      result,
      computeTime,
    };
  }
);

// Slow response endpoint
export const slowResponse = route(
  {
    method: 'GET',
    path: '/api/slow',
    expose: true,
  },
  async (req: VectorRequest) => {
    trackRequest();
    const url = new URL(req.url);
    const delay = parseInt(url.searchParams.get('delay') || '1000');
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return {
      delay,
      message: `Response delayed by ${delay}ms`,
    };
  }
);

// Metrics endpoint
export const getMetrics = route(
  {
    method: 'GET',
    path: '/api/metrics',
    expose: true,
  },
  async () => {
    trackRequest();
    const uptime = Date.now() - serverStartTime;
    const memoryUsage = process.memoryUsage();
    
    return {
      uptime,
      requests: {
        total: requestCount,
        perSecond: requestCount / (uptime / 1000),
      },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
    };
  }
);

// Reset endpoint
export const resetData = route(
  {
    method: 'POST',
    path: '/api/reset',
    expose: true,
  },
  async () => {
    trackRequest();
    // Reset data store
    dataStore.length = 0;
    
    return {
      message: 'Test data reset',
      success: true,
    };
  }
);

// Memory allocation endpoint
export const memoryAllocation = route(
  {
    method: 'GET',
    path: '/api/memory',
    expose: true,
  },
  async () => {
    trackRequest();
    // Allocate some memory (10MB)
    const size = 10 * 1024 * 1024;
    const buffer = Buffer.alloc(size);
    
    // Fill with some data to ensure allocation
    for (let i = 0; i < 100; i++) {
      buffer[i] = i % 256;
    }
    
    return {
      allocated: '10MB',
      memory: process.memoryUsage(),
    };
  }
);