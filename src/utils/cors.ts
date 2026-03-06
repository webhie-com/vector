export interface CorsConfig {
  origin: string | string[] | ((origin: string) => boolean);
  credentials: boolean;
  allowHeaders: string;
  allowMethods: string;
  exposeHeaders: string;
  maxAge: number;
}

function getAllowedOrigin(origin: string | undefined, config: CorsConfig): string | null {
  if (!origin) return typeof config.origin === 'string' ? config.origin : null;
  if (typeof config.origin === 'string') {
    return config.origin === '*' || config.origin === origin ? config.origin : null;
  }
  if (Array.isArray(config.origin)) {
    return config.origin.includes(origin) ? origin : null;
  }
  if (typeof config.origin === 'function') {
    return config.origin(origin) ? origin : null;
  }
  return null;
}

function buildCorsHeaders(origin: string | null, config: CorsConfig): Record<string, string> {
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
  }
  return headers;
}

export function cors(config: CorsConfig) {
  return {
    preflight(request: Request): Response {
      const origin = request.headers.get('origin') ?? undefined;
      const allowed = getAllowedOrigin(origin, config);
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(allowed, config),
      });
    },
    corsify(response: Response, request: Request): Response {
      const origin = request.headers.get('origin') ?? undefined;
      const allowed = getAllowedOrigin(origin, config);
      if (!allowed) return response;
      const headers = buildCorsHeaders(allowed, config);
      for (const [k, v] of Object.entries(headers)) {
        response.headers.set(k, v);
      }
      return response;
    },
  };
}
