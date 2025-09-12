import type { VectorRequest } from '../src/types';

// Request timing middleware - adds start time to request
export default async function requestTime(request: VectorRequest) {
  request.startTime = Date.now();
  return request;
}