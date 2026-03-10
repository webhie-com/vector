// Public exports for route definitions and Vector startup API
import { depRoute, route } from './http';
import { startVector } from './start-vector';

// Export route function for defining routes
export { depRoute, route };
export { startVector };

// Export utilities for route handlers
export { APIError, createResponse } from './http';

// Export types for TypeScript users
export * from './types';

// Note: Vector is config-driven and can run via CLI or programmatic startup API
