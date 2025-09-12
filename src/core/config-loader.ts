import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { toFileUrl } from '../utils/path';
import type {
  AfterMiddlewareHandler,
  BeforeMiddlewareHandler,
  CacheHandler,
  CorsOptions,
  DefaultVectorTypes,
  ProtectedHandler,
  VectorConfig,
  VectorConfigSchema,
  VectorTypes,
} from '../types';

export class ConfigLoader<TTypes extends VectorTypes = DefaultVectorTypes> {
  private configPath: string;
  private config: VectorConfigSchema<TTypes> | null = null;
  private configSource: 'user' | 'default' = 'default';

  constructor(configPath = 'vector.config.ts') {
    // Always resolve from the current working directory (user's project)
    this.configPath = resolve(process.cwd(), configPath);
  }

  async load(): Promise<VectorConfig<TTypes>> {
    // Check if config file exists before attempting to load
    if (existsSync(this.configPath)) {
      try {
        console.log(`→ Loading config from: ${this.configPath}`);
        
        // Use explicit file:// URL to ensure correct resolution
        const userConfigPath = toFileUrl(this.configPath);
        const userConfig = await import(userConfigPath);
        this.config = userConfig.default || userConfig;
        this.configSource = 'user';
        
        console.log('  ✓ User config loaded successfully');
      } catch (error) {
        console.error(`  ✗ Failed to load config from ${this.configPath}:`, error);
        console.log('  → Using default configuration');
        this.config = {};
      }
    } else {
      // Config file doesn't exist, use defaults
      console.log(`  → No config file found at: ${this.configPath}`);
      console.log('  → Using default configuration');
      this.config = {};
    }

    // Convert new config schema to legacy VectorConfig format
    return await this.buildLegacyConfig();
  }
  
  getConfigSource(): 'user' | 'default' {
    return this.configSource;
  }

  private async buildLegacyConfig(): Promise<VectorConfig<TTypes>> {
    const config: VectorConfig<TTypes> = {};

    // Server configuration
    if (this.config?.server) {
      config.port = this.config.server.port;
      config.hostname = this.config.server.hostname;
      config.reusePort = this.config.server.reusePort;
      config.development = this.config.server.development;
    }

    // Routes configuration - support both new and legacy formats
    if (this.config?.routes) {
      // New format: { routes: { dir: string } }
      config.routesDir = this.config.routes.dir || './routes';
      config.autoDiscover = this.config.routes.autoDiscover !== false;
    } else if ((this.config as any)?.routesDir) {
      // Legacy format: { routesDir: string }
      config.routesDir = (this.config as any).routesDir;
      config.autoDiscover = (this.config as any).autoDiscover !== false;
    } else {
      config.routesDir = './routes';
      config.autoDiscover = true;
    }

    // CORS configuration
    if (this.config?.cors) {
      if (typeof this.config.cors === 'boolean') {
        config.cors = this.config.cors
          ? {
              origin: '*',
              credentials: true,
              allowHeaders: 'Content-Type, Authorization',
              allowMethods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
              exposeHeaders: 'Authorization',
              maxAge: 86400,
            }
          : undefined;
      } else {
        config.cors = this.config.cors as CorsOptions;
      }
    }

    // Load middleware - support both direct functions and file paths
    if (this.config?.before) {
      // Direct functions provided
      config.before = this.config.before;
    } else if (this.config?.middleware?.before) {
      // File paths provided (legacy)
      config.before = await this.loadMiddleware<BeforeMiddlewareHandler<TTypes>>(
        this.config.middleware.before
      );
    }

    if (this.config?.after) {
      // Direct functions provided
      config.finally = this.config.after;
    } else if (this.config?.middleware?.after) {
      // File paths provided (legacy)
      config.finally = await this.loadMiddleware<AfterMiddlewareHandler<TTypes>>(
        this.config.middleware.after
      );
    }

    return config;
  }

  private async loadMiddleware<T>(paths: string[]): Promise<T[]> {
    const middleware: T[] = [];

    for (const path of paths) {
      try {
        const modulePath = resolve(process.cwd(), path);
        const importPath = toFileUrl(modulePath);
        const module = await import(importPath);
        const handler = module.default || module;

        if (typeof handler === 'function') {
          middleware.push(handler as T);
        } else {
          console.warn(`Middleware at ${path} does not export a function`);
        }
      } catch (error) {
        console.error(`Failed to load middleware from ${path}:`, error);
      }
    }

    return middleware;
  }

  async loadAuthHandler(): Promise<ProtectedHandler<TTypes> | null> {
    // Direct function provided
    if (this.config?.auth) {
      return this.config.auth;
    }

    // File path provided (legacy)
    if (!this.config?.handlers?.auth) {
      return null;
    }

    try {
      const modulePath = resolve(process.cwd(), this.config.handlers.auth);
      const importPath = toFileUrl(modulePath);
      const module = await import(importPath);
      const handler = module.default || module;

      if (typeof handler === 'function') {
        return handler as ProtectedHandler<TTypes>;
      } else {
        console.warn(`Auth handler at ${this.config.handlers.auth} does not export a function`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to load auth handler from ${this.config.handlers.auth}:`, error);
      return null;
    }
  }

  async loadCacheHandler(): Promise<CacheHandler | null> {
    // Direct function provided
    if (this.config?.cache) {
      return this.config.cache;
    }

    // File path provided (legacy)
    if (!this.config?.handlers?.cache) {
      return null;
    }

    try {
      const modulePath = resolve(process.cwd(), this.config.handlers.cache);
      const importPath = toFileUrl(modulePath);
      const module = await import(importPath);
      const handler = module.default || module;

      if (typeof handler === 'function') {
        return handler as CacheHandler;
      } else {
        console.warn(`Cache handler at ${this.config.handlers.cache} does not export a function`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to load cache handler from ${this.config.handlers.cache}:`, error);
      return null;
    }
  }

  getConfig(): VectorConfigSchema<TTypes> | null {
    return this.config;
  }
}