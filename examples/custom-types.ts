import { APIError, createVector, route } from '../src';
import type { VectorRequest, VectorTypes } from '../src/types';

// Define your custom user type
interface MyUser {
  userId: number;
  username: string;
  email: string;
  roles: string[];
  organizationId: string;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
}

// Define custom types for your application
// This interface is extensible - you can add more custom types in the future
interface MyAppTypes extends VectorTypes {
  auth: MyUser; // Custom auth user type
  // context: MyContext;
  // cache: MyCacheValue;
  // metadata: MyMetadata;
}

// Create a typed Vector instance with your custom types
const vector = createVector<MyAppTypes>();

// Configure authentication with your custom user type
vector.protected = async (request: VectorRequest<MyAppTypes>): Promise<MyUser> => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);

  // Mock token validation - replace with your actual auth logic
  if (token === 'valid-token-123') {
    return {
      userId: 1,
      username: 'john.doe',
      email: 'john@example.com',
      roles: ['admin', 'user'],
      organizationId: 'org-123',
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: true,
      },
    };
  }

  throw new Error('Invalid token');
};

// Define routes with typed request handler
vector.route(
  {
    method: 'GET',
    path: '/api/profile',
    auth: true,
    expose: true,
  },
  async (request: VectorRequest<MyAppTypes>) => {
    // authUser is fully typed as MyUser
    const user = request.authUser!;

    return {
      id: user.userId,
      username: user.username,
      email: user.email,
      organization: user.organizationId,
      canDelete: user.permissions.canDelete,
    };
  }
);

// Admin-only endpoint
vector.route(
  {
    method: 'DELETE',
    path: '/api/users/:id',
    auth: true,
    expose: true,
  },
  async (request: VectorRequest<MyAppTypes>) => {
    const user = request.authUser!;

    // Check permissions using your custom user type
    if (!user.roles.includes('admin')) {
      throw APIError.forbidden('Admin access required');
    }

    if (!user.permissions.canDelete) {
      throw APIError.forbidden('Delete permission required');
    }

    const { id } = request.params!;

    // Perform deletion...
    return {
      message: `User ${id} deleted by ${user.username}`,
      deletedBy: user.userId,
    };
  }
);

// Organization-scoped endpoint
vector.route(
  {
    method: 'GET',
    path: '/api/organization/data',
    auth: true,
    expose: true,
  },
  async (request: VectorRequest<MyAppTypes>) => {
    const user = request.authUser!;

    // Access organization-specific data
    return {
      organizationId: user.organizationId,
      accessedBy: user.username,
      permissions: user.permissions,
      data: `Organization ${user.organizationId} sensitive data`,
    };
  }
);

// Middleware can also use custom types
vector.before(async (request: VectorRequest<MyAppTypes>) => {
  console.log(`Request to ${request.url}`);

  // You can access typed authUser in middleware too
  if (request.authUser) {
    console.log(`Authenticated user: ${request.authUser.username}`);
  }

  return request;
});

// Start the server
vector.serve({
  port: 3000,
  development: true,
});

console.log('Server running with custom types at http://localhost:3000');
console.log('\nThis example demonstrates:');
console.log('- Custom auth user type (MyUser)');
console.log("- Extensible type system that won't break with future additions");
console.log('- Type-safe access to custom user properties');
console.log('\nTry these endpoints:');
console.log('  GET /api/profile (requires Bearer token)');
console.log('  DELETE /api/users/123 (requires admin role)');
console.log('  GET /api/organization/data (scoped to organization)');
