import type { VectorRequest } from '../src/types';

// CORS headers middleware - runs after route handlers
export default async function corsHeaders(response: Response, request: VectorRequest) {
  const headers = new Headers(response.headers);
  
  // Add custom CORS headers if needed
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}