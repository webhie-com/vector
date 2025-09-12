import { route } from '../../../src';

// Simple hello world route
export const hello = route(
  {
    method: 'GET',
    path: '/hello',
    expose: true,
  },
  async () => {
    return {
      message: 'Hello from the new config-driven Vector framework!',
      timestamp: new Date().toISOString(),
    };
  }
);

// Protected route that requires authentication
export const protectedHello = route(
  {
    method: 'GET',
    path: '/hello/protected',
    expose: true,
    auth: true,
  },
  async (req) => {
    return {
      message: `Hello ${req.authUser?.email}!`,
      user: req.authUser,
      timestamp: new Date().toISOString(),
    };
  }
);

// Cached route
export const cachedData = route(
  {
    method: 'GET',
    path: '/hello/cached',
    expose: true,
    cache: 30, // Cache for 30 seconds
  },
  async () => {
    // This expensive operation will be cached
    const data = {
      message: 'This response is cached for 30 seconds',
      randomNumber: Math.random(),
      generatedAt: new Date().toISOString(),
    };
    
    return data;
  }
);