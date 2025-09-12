import { APIError, createVector, route } from '../src';
import type { VectorRequest, VectorTypes } from '../src/types';

// Define your custom AuthUser type
interface MyAuthUser {
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

// Define custom types (backward compatible approach)
interface MyTypes extends VectorTypes {
  auth: MyAuthUser;
}

// Create a typed Vector instance with your custom AuthUser
const vector = createVector<MyTypes>();

// Configure authentication with your custom user type
vector.protected = async (request: VectorRequest<MyTypes>): Promise<MyAuthUser> => {
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
  async (request: VectorRequest<MyTypes>) => {
    // authUser is fully typed as MyAuthUser
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
  async (request: VectorRequest<MyTypes>) => {
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
  async (request: VectorRequest<MyTypes>) => {
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

// Start the server
vector.serve({
  port: 3000,
  development: true,
});

console.log('Server running with custom AuthUser type at http://localhost:3000');
console.log('Try these endpoints:');
console.log('  GET /api/profile (requires Bearer token)');
console.log('  DELETE /api/users/123 (requires admin role)');
console.log('  GET /api/organization/data (scoped to organization)');
