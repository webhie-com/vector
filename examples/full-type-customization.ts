import { APIError, createVector } from '../src';
import type { VectorRequest, VectorTypes } from '../src/types';

// Define custom user type
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
  permissions: string[];
  organizationId: string;
}

// Define custom context type for request-scoped data
interface RequestContext {
  requestId: string;
  startTime: number;
  userId?: string;
  organizationId?: string;
  featureFlags: {
    newUI: boolean;
    betaFeatures: boolean;
  };
  analytics: {
    userAgent: string;
    ip: string;
    country?: string;
  };
}

// Define custom cache value type
interface CachedData {
  version: number;
  timestamp: Date;
  data: {
    products?: Product[];
    user?: User;
    computedValues?: any;
  };
  ttl: number;
}

// Define custom metadata type for routes
interface RouteMetadata {
  rateLimit?: {
    requests: number;
    window: number; // seconds
  };
  requiredPermissions?: string[];
  tags?: string[];
  cache?: {
    public: boolean;
    maxAge: number;
  };
  analytics?: {
    track: boolean;
    category: string;
  };
}

// Product type for examples
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

// Define all custom types for the application
interface AppTypes extends VectorTypes {
  auth: User;
  context: RequestContext;
  cache: CachedData;
  metadata: RouteMetadata;
}

// Create Vector instance with custom types
const vector = createVector<AppTypes>();

// Configure authentication
vector.protected = async (request: VectorRequest<AppTypes>): Promise<User> => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);

  // Mock token validation
  if (token === 'admin-token') {
    return {
      id: 'user-123',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'admin'],
      organizationId: 'org-456',
    };
  }

  throw new Error('Invalid token');
};

// Middleware to initialize and populate context
vector.before(async (request: VectorRequest<AppTypes>) => {
  // Initialize context with request-scoped data
  request.context = {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
    featureFlags: {
      newUI: true,
      betaFeatures: request.headers.get('X-Beta-Features') === 'true',
    },
    analytics: {
      userAgent: request.headers.get('User-Agent') || 'unknown',
      ip: request.headers.get('X-Forwarded-For') || '127.0.0.1',
    },
  };

  // If authenticated, add user info to context
  if (request.authUser) {
    request.context.userId = request.authUser.id;
    request.context.organizationId = request.authUser.organizationId;
  }

  console.log(`[${request.context.requestId}] ${request.method} ${request.url}`);

  return request;
});

// Public endpoint with caching and metadata
vector.route(
  {
    method: 'GET',
    path: '/api/products',
    expose: true,
    cache: 300, // 5 minutes
    metadata: {
      rateLimit: {
        requests: 100,
        window: 60,
      },
      tags: ['public', 'products'],
      cache: {
        public: true,
        maxAge: 300,
      },
      analytics: {
        track: true,
        category: 'product-api',
      },
    },
  },
  async (request: VectorRequest<AppTypes>) => {
    // Access metadata in handler
    const metadata = request.metadata;
    console.log(`Route tags: ${metadata?.tags?.join(', ')}`);

    // Use context for feature flags
    if (request.context.featureFlags.betaFeatures) {
      console.log('Beta features enabled for this request');
    }

    // Simulate fetching products
    const products: Product[] = [
      { id: '1', name: 'Laptop', price: 999, category: 'Electronics' },
      { id: '2', name: 'Mouse', price: 29, category: 'Electronics' },
      { id: '3', name: 'Keyboard', price: 79, category: 'Electronics' },
    ];

    // Cache the result with typed cache value
    const cacheManager = vector.getCacheManager();
    const cacheKey = `products:${request.context.organizationId || 'public'}`;

    await cacheManager.set(
      cacheKey,
      {
        version: 1,
        timestamp: new Date(),
        data: { products },
        ttl: 300,
      },
      300
    );

    return {
      requestId: request.context.requestId,
      products,
      cached: false,
      beta: request.context.featureFlags.betaFeatures,
    };
  }
);

// Protected endpoint with permission checking via metadata
vector.route(
  {
    method: 'DELETE',
    path: '/api/products/:id',
    auth: true,
    expose: true,
    metadata: {
      requiredPermissions: ['delete', 'admin'],
      rateLimit: {
        requests: 10,
        window: 60,
      },
      tags: ['admin', 'destructive'],
      analytics: {
        track: true,
        category: 'admin-actions',
      },
    },
  },
  async (request: VectorRequest<AppTypes>) => {
    const user = request.authUser!;
    const metadata = request.metadata!;

    // Check permissions from metadata
    const hasPermission = metadata.requiredPermissions?.every((perm) =>
      user.permissions.includes(perm)
    );

    if (!hasPermission) {
      throw APIError.forbidden('Insufficient permissions');
    }

    const { id } = request.params!;

    // Log admin action with context
    console.log(`[${request.context.requestId}] Admin ${user.name} deleted product ${id}`);

    // Clear related cache
    const cacheManager = vector.getCacheManager();
    const cacheKey = `products:${request.context.organizationId}`;
    cacheManager.delete(cacheKey);

    return {
      success: true,
      deletedBy: user.id,
      productId: id,
      timestamp: new Date(),
      requestId: request.context.requestId,
    };
  }
);

// Endpoint demonstrating context manipulation across middleware
vector.route(
  {
    method: 'GET',
    path: '/api/analytics',
    auth: true,
    expose: true,
    metadata: {
      tags: ['analytics', 'monitoring'],
    },
  },
  async (request: VectorRequest<AppTypes>) => {
    // Calculate request duration using context
    const duration = Date.now() - request.context.startTime;

    // Access all context data
    return {
      requestId: request.context.requestId,
      duration: `${duration}ms`,
      user: request.context.userId,
      organization: request.context.organizationId,
      featureFlags: request.context.featureFlags,
      analytics: request.context.analytics,
      metadata: request.metadata,
    };
  }
);

// Endpoint using typed cache operations
vector.route(
  {
    method: 'GET',
    path: '/api/cached-data',
    auth: true,
    expose: true,
  },
  async (request: VectorRequest<AppTypes>) => {
    const cacheManager = vector.getCacheManager();
    const cacheKey = `user-data:${request.authUser!.id}`;

    // Type-safe cache retrieval
    const cached = await cacheManager.get<CachedData>(
      cacheKey,
      async () => {
        // Compute expensive data
        const data: CachedData = {
          version: 1,
          timestamp: new Date(),
          data: {
            user: request.authUser!,
            computedValues: {
              score: Math.random() * 100,
              level: Math.floor(Math.random() * 10),
            },
          },
          ttl: 600,
        };
        return data;
      },
      600 // 10 minutes
    );

    return {
      cached: true,
      version: cached.version,
      timestamp: cached.timestamp,
      data: cached.data,
    };
  }
);

// After middleware to add response headers based on metadata
vector.finally(async (response: Response, request: VectorRequest<AppTypes>) => {
  const newHeaders = new Headers(response.headers);

  // Add request ID header
  newHeaders.set('X-Request-Id', request.context.requestId);

  // Add cache headers from metadata
  if (request.metadata?.cache) {
    if (request.metadata.cache.public) {
      newHeaders.set('Cache-Control', `public, max-age=${request.metadata.cache.maxAge}`);
    }
  }

  // Add timing header
  const duration = Date.now() - request.context.startTime;
  newHeaders.set('X-Response-Time', `${duration}ms`);

  // Log analytics if configured
  if (request.metadata?.analytics?.track) {
    console.log(
      `Analytics: ${request.metadata.analytics.category} - ${request.method} ${request.url} - ${duration}ms`
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
});

// Start the server
vector.serve({
  port: 3000,
  development: true,
});

console.log('🚀 Server running with full type customization at http://localhost:3000');
console.log('\n📦 Custom Types Implemented:');
console.log('  ✅ Auth: Custom User type with roles and permissions');
console.log('  ✅ Context: Request-scoped data (requestId, timing, feature flags)');
console.log('  ✅ Cache: Typed cache values with versioning');
console.log('  ✅ Metadata: Route-level configuration (rate limits, permissions, tags)');
console.log('\n🔧 Features Demonstrated:');
console.log('  - Type-safe operations throughout the request lifecycle');
console.log('  - Context initialization and manipulation');
console.log('  - Metadata-driven route behavior');
console.log('  - Typed cache operations with custom structure');
console.log('  - Permission checking via metadata');
console.log('  - Request tracking and analytics');
console.log('\n📝 Try these endpoints:');
console.log('  GET  /api/products         - Public endpoint with caching');
console.log('  DELETE /api/products/:id   - Admin-only with permission checks');
console.log('  GET  /api/analytics        - View request context data');
console.log('  GET  /api/cached-data      - Typed cache operations');
