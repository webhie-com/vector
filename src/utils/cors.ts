export interface CorsConfig {
  origin: string | string[] | ((origin: string) => boolean);
  credentials: boolean;
  allowHeaders: string;
  allowMethods: string;
  exposeHeaders: string;
  maxAge: number;
}

function getAllowedOrigin(origin: string | undefined, config: CorsConfig): string | null {
  if (!origin) {
    if (typeof config.origin === 'string') {
      // Credentials cannot be combined with wildcard; only reflect concrete request origins.
      if (config.origin === '*' && config.credentials) return null;
      return config.origin;
    }
    return null;
  }

  if (typeof config.origin === 'string') {
    if (config.origin === '*') {
      return config.credentials ? origin : '*';
    }
    return config.origin === origin ? origin : null;
  }
  if (Array.isArray(config.origin)) {
    return config.origin.includes(origin) ? origin : null;
  }
  if (typeof config.origin === 'function') {
    return config.origin(origin) ? origin : null;
  }
  return null;
}

function shouldVaryByOrigin(config: CorsConfig): boolean {
  return (
    (typeof config.origin === 'string' && config.origin === '*' && config.credentials) ||
    Array.isArray(config.origin) ||
    typeof config.origin === 'function'
  );
}

function buildCorsHeaders(origin: string | null, config: CorsConfig, varyByOrigin: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = config.allowMethods;
    headers['access-control-allow-headers'] = config.allowHeaders;
    headers['access-control-expose-headers'] = config.exposeHeaders;
    headers['access-control-max-age'] = String(config.maxAge);
    if (config.credentials) {
      headers['access-control-allow-credentials'] = 'true';
    }
    if (varyByOrigin) {
      headers.vary = 'Origin';
    }
  }
  return headers;
}

function mergeVary(existing: string | null, nextValue: string): string {
  if (!existing) return nextValue;
  const parts = existing
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const lower = parts.map((v) => v.toLowerCase());
  if (!lower.includes(nextValue.toLowerCase())) {
    parts.push(nextValue);
  }
  return parts.join(', ');
}

export function cors(config: CorsConfig) {
  // Everything except the allowed origin and Vary is the same for every response.
  const staticHeaderEntries = Object.entries(buildCorsHeaders('*', config, false)).filter(
    ([name]) => name !== 'access-control-allow-origin'
  );
  const varyByOriginConfig = shouldVaryByOrigin(config);

  return {
    preflight(request: Request): Response {
      const origin = request.headers.get('origin') ?? undefined;
      const allowed = getAllowedOrigin(origin, config);
      const varyByOrigin = Boolean(origin && allowed && shouldVaryByOrigin(config));
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(allowed, config, varyByOrigin),
      });
    },
    corsify(response: Response, request: Request): Response {
      const origin = request.headers.get('origin') ?? undefined;
      const allowed = getAllowedOrigin(origin, config);
      if (!allowed) return response;
      const headers = response.headers;
      headers.set('access-control-allow-origin', allowed);
      for (const [name, value] of staticHeaderEntries) {
        headers.set(name, value);
      }
      if (origin && varyByOriginConfig) {
        headers.set('vary', mergeVary(headers.get('vary'), 'Origin'));
      }
      return response;
    },
  };
}
