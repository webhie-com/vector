import type { Server } from 'bun';
import type { RouteEntry } from 'itty-router';
import { AuthManager } from '../auth/protected';
import { CacheManager } from '../cache/manager';
import { RouteGenerator } from '../dev/route-generator';
import { RouteScanner } from '../dev/route-scanner';
import { MiddlewareManager } from '../middleware/manager';
import { toFileUrl } from '../utils/path';
import type {
  CacheHandler,
  DefaultVectorTypes,
  ProtectedHandler,
  RouteHandler,
  RouteOptions,
  VectorConfig,
  VectorTypes,
} from '../types';
import { VectorRouter } from './router';
import { VectorServer } from './server';

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
  addRoute(options: RouteOptions<TTypes>, handler: RouteHandler<TTypes>): RouteEntry {
    return this.router.route(options, handler);
  }

  // Internal method to start server - only called by CLI
  async startServer(config?: VectorConfig<TTypes>): Promise<Server> {
    this.config = { ...this.config, ...config };

    // Clear previous middleware to avoid accumulation across multiple starts
    this.middlewareManager.clear();

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

    if (!this.routeScanner) {
      this.routeScanner = new RouteScanner(routesDir);
    }

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
                const routeDef = exported as any;
                this.router.route(routeDef.options, routeDef.handler);
                this.logRouteLoaded(routeDef.options);
              } else if (this.isRouteEntry(exported)) {
                // Legacy support for direct RouteEntry (won't have middleware)
                this.router.addRoute(exported as RouteEntry);
                this.logRouteLoaded(exported as RouteEntry);
              } else if (typeof exported === 'function') {
                this.router.route(route.options as any, exported);
                this.logRouteLoaded(route.options);
              }
            }
          } catch (error) {
            console.error(`Failed to load route ${route.name} from ${route.path}:`, error);
          }
        }

        // Ensure routes are properly sorted after loading all
        this.router.sortRoutes();
        console.log(`✅ Loaded ${routes.length} routes from ${routesDir}`);
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
      if (Array.isArray(routeEntry)) {
        this.router.addRoute(routeEntry as RouteEntry);
      }
    } else if (routeModule && typeof routeModule === 'object') {
      for (const [, value] of Object.entries(routeModule)) {
        if (typeof value === 'function') {
          const routeEntry = (value as any)();
          if (Array.isArray(routeEntry)) {
            this.router.addRoute(routeEntry as RouteEntry);
          }
        }
      }
    }
  }

  private isRouteEntry(value: any): boolean {
    return Array.isArray(value) && value.length >= 3;
  }

  private isRouteDefinition(value: any): boolean {
    return value && typeof value === 'object' && 'entry' in value && 'options' in value && 'handler' in value;
  }

  private logRouteLoaded(route: RouteEntry | RouteOptions): void {
    if (Array.isArray(route)) {
      console.log(`  ✓ Loaded route: ${route[0]} ${route[3] || route[1]}`);
    } else {
      console.log(`  ✓ Loaded route: ${route.method} ${route.path}`);
    }
  }

  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    // Don't reset managers - they should persist for the singleton
    // Only clear route-specific state if needed
    this.router.clearRoutes();
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
