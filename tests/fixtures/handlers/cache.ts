// Cache handler - called for routes with cache option
// This example uses an in-memory cache, but you could use Redis, Memcached, etc.

interface CacheEntry {
  data: any;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expires < now) {
      cache.delete(key);
    }
  }
}, 60000); // Clean every minute

export default async function cacheHandler(
  key: string,
  factory: () => Promise<any>,
  ttl: number
): Promise<any> {
  // Check if cached and not expired
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    console.log(`Cache hit: ${key}`);
    return cached.data;
  }
  
  // Cache miss - call factory function
  console.log(`Cache miss: ${key}`);
  const data = await factory();
  
  // Store in cache with expiration
  cache.set(key, {
    data,
    expires: Date.now() + ttl * 1000,
  });
  
  // Optional: Limit cache size
  if (cache.size > 1000) {
    // Remove oldest entries
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].expires - b[1].expires);
    
    // Remove first 100 entries
    for (let i = 0; i < 100; i++) {
      cache.delete(entries[i][0]);
    }
  }
  
  return data;
}