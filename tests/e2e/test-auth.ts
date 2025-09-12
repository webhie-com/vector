import type { VectorRequest } from '../../src/types';

// Test authentication handler
export default async function authenticate(request: VectorRequest) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization token');
  }
  
  const token = authHeader.substring(7);
  
  // Test token for E2E tests
  if (token === 'test-token-123') {
    return {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
      permissions: ['read', 'write', 'delete'],
    };
  }
  
  throw new Error('Invalid token');
}