import type { VectorContext } from '../src/types';

// Logger middleware - runs before route handlers
export default async function logger(context: VectorContext) {
  const timestamp = new Date().toISOString();
  const method = context.request.method;
  const url = context.request.url;

  console.log(`[${timestamp}] ${method} ${url}`);
}
