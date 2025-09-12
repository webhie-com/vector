import type { VectorRequest } from '../src/types';

// Simple rate limiting middleware
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS = 100;

export default async function rateLimit(request: VectorRequest) {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('cf-connecting-ip') || 
             'unknown';
  
  const now = Date.now();
  const userLimit = requestCounts.get(ip);
  
  if (!userLimit || userLimit.resetTime < now) {
    // Create new window
    requestCounts.set(ip, {
      count: 1,
      resetTime: now + WINDOW_MS
    });
  } else {
    // Check if limit exceeded
    if (userLimit.count >= MAX_REQUESTS) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((userLimit.resetTime - now) / 1000))
        }
      });
    }
    
    // Increment count
    userLimit.count++;
  }
  
  return request;
}