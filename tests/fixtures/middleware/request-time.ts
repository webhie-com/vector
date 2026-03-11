import type { VectorContext } from '../src/types';

// Request timing middleware - adds start time to request
export default async function requestTime(context: VectorContext) {
  context.startTime = Date.now();
}
