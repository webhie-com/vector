import type { VectorRequest } from '../src/types';

// Response time middleware - runs after route handlers
export default async function responseTime(response: Response, request: VectorRequest) {
  if (request.startTime) {
    const duration = Date.now() - request.startTime;
    
    // Add response time header
    const headers = new Headers(response.headers);
    headers.set('X-Response-Time', `${duration}ms`);
    
    // Log the response time
    console.log(`Response time: ${duration}ms`);
    
    // Return new response with updated headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  
  return response;
}