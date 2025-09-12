import vector, { APIError, route } from '../src';

// Simple public endpoint
vector.route(
  {
    method: 'GET',
    path: '/api/hello',
    expose: true,
  },
  async () => {
    return { message: 'Hello from Vector!' };
  }
);

// Protected endpoint with authentication
vector.protected = async (request) => {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  if (token === 'secret-token') {
    return { id: 1, name: 'John Doe' };
  }

  throw new Error('Invalid token');
};

vector.route(
  {
    method: 'GET',
    path: '/api/user',
    expose: true,
    auth: true,
  },
  async (request) => {
    return {
      user: request.authUser,
      message: `Hello ${request.authUser?.name}!`,
    };
  }
);

// POST endpoint with body parsing
vector.route(
  {
    method: 'POST',
    path: '/api/echo',
    expose: true,
  },
  async (request) => {
    return {
      received: request.content,
      timestamp: new Date().toISOString(),
    };
  }
);

// Error handling example
vector.route(
  {
    method: 'GET',
    path: '/api/error',
    expose: true,
  },
  async () => {
    throw APIError.badRequest('This is a controlled error');
  }
);

// Start server
vector.serve({ port: 3000 });

console.log('🚀 Vector server running at http://localhost:3000');
console.log('\nTry these endpoints:');
console.log('  GET  /api/hello');
console.log('  GET  /api/user (requires Authorization: Bearer secret-token)');
console.log('  POST /api/echo (send JSON body)');
console.log('  GET  /api/error (returns error response)');
