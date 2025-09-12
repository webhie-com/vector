import type { VectorRequest } from "../src/types";

// Logger middleware - runs before route handlers
export default async function logger(request: VectorRequest) {
  const timestamp = new Date().toISOString();
  const method = request.method;
  const url = request.url;
  
  console.log(`[${timestamp}] ${method} ${url}`);

  // Return the request to continue processing
  return request;
}
