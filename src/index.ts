import { Vector } from './core/vector';
import { route } from './http';
import type { DefaultVectorTypes, VectorTypes } from './types';

export { route, Vector };
export { AuthManager } from './auth/protected';
export { CacheManager } from './cache/manager';
export { APIError, createResponse } from './http';
export { MiddlewareManager } from './middleware/manager';
export * from './types';

// Create a typed Vector instance with custom types
export function createVector<TTypes extends VectorTypes = DefaultVectorTypes>(): Vector<TTypes> {
  return Vector.getInstance<TTypes>();
}

// Default vector instance with default AuthUser type
const vector = Vector.getInstance();
export default vector;
