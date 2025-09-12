import vector, { APIError, route } from '../src/index';
import type { VectorRequest } from '../src/types';

// ============================================
// COMPLETE USAGE EXAMPLE FOR VECTOR FRAMEWORK
// ============================================

// 1. Configure Authentication Handler
// This function will be called for all protected routes
vector.protected = async (request: VectorRequest) => {
  // Example: Extract token from Authorization header
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization token');
  }

  const token = authHeader.substring(7);

  // Example: Validate token and return user object
  // In production, you would verify JWT, check database, etc.
  if (token === 'valid-token') {
    return {
      id: 'user-123',
      email: 'user@example.com',
      role: 'admin',
      permissions: ['read', 'write', 'delete'],
    };
  }

  throw new Error('Invalid token');
};

// 2. Configure Cache Handler (Optional)
// This will be used for all routes with cache option
vector.cache = async (key: string, factory: () => Promise<any>, ttl: number) => {
  // Example: Use Redis, Memcached, or any cache service
  // For demo, we'll use a simple in-memory cache
  const cache = new Map<string, { data: any; expires: number }>();

  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    console.log(`Cache hit: ${key}`);
    return cached.data;
  }

  console.log(`Cache miss: ${key}`);
  const data = await factory();

  cache.set(key, {
    data,
    expires: Date.now() + ttl * 1000,
  });

  return data;
};

// 3. Define Middleware Functions
const loggingMiddleware = async (request: VectorRequest) => {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
  return request;
};

const rateLimitMiddleware = async (request: VectorRequest) => {
  // Example rate limiting logic
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  // Check rate limits here
  return request;
};

const responseTimeMiddleware = async (request: VectorRequest) => {
  request.startTime = Date.now();
  return request;
};

const metricsMiddleware = async (response: Response, request: VectorRequest) => {
  const duration = Date.now() - (request.startTime || Date.now());
  console.log(`Response time: ${duration}ms`);
  return response;
};

// 4. Define Routes (can also be auto-discovered from routes/ directory)

// Public route example
export const publicEndpoint = route(
  {
    method: 'GET',
    path: '/api/public',
    expose: true,
    cache: 30, // Cache for 30 seconds
  },
  async (req) => {
    return {
      message: 'This is a public endpoint',
      timestamp: new Date().toISOString(),
    };
  }
);

// Protected route example
export const protectedEndpoint = route(
  {
    method: 'GET',
    path: '/api/protected',
    expose: true,
    auth: true, // Requires authentication
  },
  async (req) => {
    return {
      message: 'This is a protected endpoint',
      user: req.authUser,
      timestamp: new Date().toISOString(),
    };
  }
);

// Route with request body
export const createResource = route(
  {
    method: 'POST',
    path: '/api/resources',
    expose: true,
    auth: true,
  },
  async (req) => {
    const data = req.content; // Automatically parsed JSON body

    return {
      success: true,
      resource: {
        id: Date.now(),
        ...data,
        createdBy: req.authUser?.id,
        createdAt: new Date().toISOString(),
      },
    };
  }
);

// 5. Configure Middleware
vector.before(loggingMiddleware);
vector.before(rateLimitMiddleware);
vector.before(responseTimeMiddleware);
vector.finally(metricsMiddleware);

// 6. Start the Server
async function startServer() {
  const server = await vector.serve({
    // Server configuration
    port: 4000,
    hostname: 'localhost',
    reusePort: true,
    development: process.env.NODE_ENV === 'development',

    // Routes configuration
    routesDir: './routes', // Auto-discover routes from this directory
  });

  console.log('🚀 Vector server is running!');
  console.log(`📍 URL: http://localhost:4000`);
  console.log('📁 Routes are auto-discovered from ./routes directory');
  console.log('🔐 Authentication is configured');
  console.log('💾 Caching is enabled');

  return server;
}

// 7. Alternative: Manual Route Registration
async function manualSetup() {
  // Register routes manually using vector.route()
  vector.route(
    {
      method: 'GET',
      path: '/api/manual',
      expose: true,
    },
    async (req) => {
      return { message: 'Manually registered route' };
    }
  );

  // Start server
  return vector.serve({
    port: 4000,
  });
}

// 8. Development Mode with CLI
// Run: bun vector dev
// This will:
// - Auto-discover routes from ./routes directory
// - Watch for file changes
// - Reload routes automatically
// - Enable development logging

// 9. Production Build
// Run: bun vector build
// This will:
// - Generate optimized route manifest
// - Bundle the application
// - Minify the output

// Export for use as a library
export default vector;

// Start server if running directly
if (import.meta.main) {
  startServer().catch(console.error);
}
