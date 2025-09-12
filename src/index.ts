// Public exports for route definitions only
import { route } from "./http";

// Export route function for defining routes
export { route };

// Export utilities for route handlers
export { APIError, createResponse } from "./http";

// Export types for TypeScript users
export * from "./types";

// Note: Vector framework is now config-driven and runs via CLI
// Usage: Create vector.config.ts and run 'vector dev' or 'vector start'
