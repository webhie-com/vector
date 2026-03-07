import type { Server } from 'bun';
import { AuthManager } from '../auth/protected';
import { CacheManager } from '../cache/manager';
import { RouteGenerator } from '../dev/route-generator';
import { RouteScanner } from '../dev/route-scanner';
import { MiddlewareManager } from '../middleware/manager';
import { toFileUrl } from '../utils/path';
import type {
  CacheHandler,
  DefaultVectorTypes,
  LegacyRouteEntry,
  ProtectedHandler,
  RouteHandler,
  RouteOptions,
  VectorConfig,
  VectorTypes,
} from '../types';
import { VectorRouter } from './router';
import { VectorServer } from './server';

interface LoadedRouteDefinition<TTypes extends VectorTypes = DefaultVectorTypes> {
  entry: { method: string; path: string };
  options: RouteOptions<TTypes>;
  handler: RouteHandler<TTypes>;
}

// Internal-only class - not exposed to users
export class Vector<TTypes extends VectorTypes = DefaultVectorTypes> {
  private static instance: Vector<any>;
  private router: VectorRouter<TTypes>;
  private server: VectorServer<TTypes> | null = null;
  private middlewareManager: MiddlewareManager<TTypes>;
  private authManager: AuthManager<TTypes>;
  private cacheManager: CacheManager<TTypes>;
  private config: VectorConfig<TTypes> = {};
  private routeScanner: RouteScanner | null = null;
  private routeGenerator: RouteGenerator | null = null;
  private _protectedHandler: ProtectedHandler<TTypes> | null = null;
  private _cacheHandler: CacheHandler | null = null;

  private constructor() {
    this.middlewareManager = new MiddlewareManager<TTypes>();
    this.authManager = new AuthManager<TTypes>();
    this.cacheManager = new CacheManager<TTypes>();
    this.router = new VectorRouter<TTypes>(
      this.middlewareManager,
      this.authManager,
      this.cacheManager
    );
  }

  // Internal use only - not exposed to users
  static getInstance<T extends VectorTypes = DefaultVectorTypes>(): Vector<T> {
    if (!Vector.instance) {
      Vector.instance = new Vector<T>();
    }
    return Vector.instance as Vector<T>;
  }

  // Internal method to set protected handler
  setProtectedHandler(handler: ProtectedHandler<TTypes>) {
    this._protectedHandler = handler;
    this.authManager.setProtectedHandler(handler);
  }

  getProtectedHandler(): ProtectedHandler<TTypes> | null {
    return this._protectedHandler;
  }

  // Internal method to set cache handler
  setCacheHandler(handler: CacheHandler) {
    this._cacheHandler = handler;
    this.cacheManager.setCacheHandler(handler);
  }

  getCacheHandler(): CacheHandler | null {
    return this._cacheHandler;
  }

  // Internal method to add route
  addRoute(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>): void {
    this.router.route(options, handler);
  }

  // Internal method to start server - only called by CLI
  async startServer(config?: VectorConfig<TTypes>): Promise<Server> {
    this.config = { ...this.config, ...config };

    // Clear previous middleware to avoid accumulation across multiple starts
    this.middlewareManager.clear();

    // Only clear routes if we're doing auto-discovery
    if (this.config.autoDiscover !== false) {
      this.router.clearRoutes();
    }

    if (config?.before) {
      this.middlewareManager.addBefore(...config.before);
    }

    if (config?.finally) {
      this.middlewareManager.addFinally(...config.finally);
    }

    if (this.config.autoDiscover !== false) {
      await this.discoverRoutes();
    }

    this.server = new VectorServer<TTypes>(this.router, this.config);
    const bunServer = await this.server.start();

    return bunServer;
  }

  private async discoverRoutes() {
    const routesDir = this.config.routesDir || './routes';
    const excludePatterns = this.config.routeExcludePatterns;

    // Always create a new RouteScanner with the current config's routesDir
    // to ensure we're using the correct path from the user's config
    this.routeScanner = new RouteScanner(routesDir, excludePatterns);

    if (!this.routeGenerator) {
      this.routeGenerator = new RouteGenerator();
    }

    try {
      const routes = await this.routeScanner.scan();

      if (routes.length > 0) {
        if (this.config.development) {
          await this.routeGenerator.generate(routes);
        }

        for (const route of routes) {
          try {
            const importPath = toFileUrl(route.path);

            const module = await import(importPath);
            const exported = route.name === 'default' ? module.default : module[route.name];

            if (exported) {
              if (this.isRouteDefinition(exported)) {
                // Use router.route() to ensure middleware is applied
                this.router.route(exported.options, exported.handler);
                this.logRouteLoaded(exported.options);
              } else if (this.isRouteEntry(exported)) {
                // Legacy support for direct RouteEntry (won't have middleware)
                this.router.addRoute(exported);
                this.logRouteLoaded(exported);
              } else if (typeof exported === 'function') {
                this.router.route(
                  route.options as RouteOptions<TTypes>,
                  exported as RouteHandler<TTypes>
                );
                this.logRouteLoaded(route.options as RouteOptions<TTypes>);
              }
            }
          } catch (error) {
            console.error(`Failed to load route ${route.name} from ${route.path}:`, error);
          }
        }
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT' && (error as any).code !== 'ENOTDIR') {
        console.error('Failed to discover routes:', error);
      }
    }
  }

  async loadRoute(routeModule: any) {
    if (typeof routeModule === 'function') {
      const routeEntry = routeModule();
      if (this.isRouteEntry(routeEntry)) {
        this.router.addRoute(routeEntry);
      }
    } else if (routeModule && typeof routeModule === 'object') {
      for (const [, value] of Object.entries(routeModule)) {
        if (typeof value === 'function') {
          const routeEntry = value();
          if (this.isRouteEntry(routeEntry)) {
            this.router.addRoute(routeEntry);
          }
        }
      }
    }
  }

  private isRouteEntry(value: unknown): value is LegacyRouteEntry {
    if (!Array.isArray(value) || value.length < 3) {
      return false;
    }

    const [method, matcher, handlers, path] = value;
    return (
      typeof method === 'string' &&
      matcher instanceof RegExp &&
      Array.isArray(handlers) &&
      handlers.length > 0 &&
      handlers.every((handler) => typeof handler === 'function') &&
      (path === undefined || typeof path === 'string')
    );
  }

  private isRouteDefinition(value: unknown): value is LoadedRouteDefinition<TTypes> {
    return (
      value !== null &&
      typeof value === 'object' &&
      'entry' in value &&
      'options' in value &&
      'handler' in value &&
      typeof (value as LoadedRouteDefinition<TTypes>).handler === 'function'
    );
  }

  private logRouteLoaded(_: RouteOptions<TTypes> | LegacyRouteEntry): void {
    // Silent - no logging
  }

  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    // Don't reset managers or routes - they persist for the singleton
    // Routes will be cleared on next startServer() call
  }

  getServer(): VectorServer<TTypes> | null {
    return this.server;
  }

  getRouter(): VectorRouter<TTypes> {
    return this.router;
  }

  getCacheManager(): CacheManager<TTypes> {
    return this.cacheManager;
  }

  getAuthManager(): AuthManager<TTypes> {
    return this.authManager;
  }

  // Reset instance for testing purposes only
  static resetInstance(): void {
    Vector.instance = null as any;
  }
}

// Export for internal use only
export const getVectorInstance = Vector.getInstance;
