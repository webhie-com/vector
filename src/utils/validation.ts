import { DEFAULT_CONFIG } from '../constants';
import type { CorsOptions, VectorConfig } from '../types';

export function validateConfig(config: VectorConfig): VectorConfig {
  const validatedConfig: VectorConfig = {
    port: validatePort(config.port),
    hostname: config.hostname || DEFAULT_CONFIG.HOSTNAME,
    reusePort: config.reusePort !== false,
    development: config.development || false,
    routesDir: config.routesDir || DEFAULT_CONFIG.ROUTES_DIR,
    autoDiscover: config.autoDiscover !== false,
    cors: config.cors ? validateCorsOptions(config.cors) : undefined,
    before: config.before || [],
    finally: config.finally || [],
  };

  return validatedConfig;
}

function validatePort(port?: number): number {
  if (port === undefined) {
    return DEFAULT_CONFIG.PORT;
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}. Port must be between 1 and 65535.`);
  }

  return port;
}

function validateCorsOptions(cors: CorsOptions | boolean): CorsOptions | undefined {
  if (cors === false) {
    return undefined;
  }

  if (cors === true) {
    return {
      origin: '*',
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['Authorization'],
      maxAge: DEFAULT_CONFIG.CORS_MAX_AGE,
    };
  }

  return cors;
}

export function isValidHttpMethod(method: string): boolean {
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
  return validMethods.includes(method.toUpperCase());
}

export function isValidPath(path: string): boolean {
  return path.startsWith('/') && !path.includes(' ');
}
