import type { VectorRequest } from '../src/types';

// Authentication handler - called for routes with auth: true
export default async function authenticate(request: VectorRequest) {
  // Extract token from Authorization header
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization token');
  }
  
  const token = authHeader.substring(7);
  
  // Example: Validate token and return user object
  // In production, you would:
  // - Verify JWT signature
  // - Check token expiration
  // - Query database for user details
  // - Check permissions
  
  if (token === 'valid-token') {
    return {
      id: 'user-123',
      email: 'user@example.com',
      role: 'admin',
      permissions: ['read', 'write', 'delete'],
    };
  }
  
  // Example with different token
  if (token === 'user-token') {
    return {
      id: 'user-456',
      email: 'john@example.com',
      role: 'user',
      permissions: ['read'],
    };
  }
  
  throw new Error('Invalid token');
}