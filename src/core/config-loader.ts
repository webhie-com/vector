import { existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { toFileUrl } from "../utils/path";
import type {
  CacheHandler,
  CorsOptions,
  DefaultVectorTypes,
  ProtectedHandler,
  VectorConfig,
  VectorConfigSchema,
  VectorTypes,
} from "../types";

export class ConfigLoader<TTypes extends VectorTypes = DefaultVectorTypes> {
  private configPath: string;
  private config: VectorConfigSchema<TTypes> | null = null;
  private configSource: "user" | "default" = "default";

  constructor(configPath?: string) {
    // Use provided config path or default to vector.config.ts
    const path = configPath || "vector.config.ts";

    // Handle absolute vs relative paths
    this.configPath = isAbsolute(path)
      ? path
      : resolve(process.cwd(), path);
  }

  async load(): Promise<VectorConfig<TTypes>> {
    // Check if config file exists before attempting to load
    if (existsSync(this.configPath)) {
      try {
        // Use explicit file:// URL to ensure correct resolution
        const userConfigPath = toFileUrl(this.configPath);
        const userConfig = await import(userConfigPath);
        this.config = userConfig.default || userConfig;
        this.configSource = "user";
      } catch (error: any) {
        const red = "\x1b[31m";
        const reset = "\x1b[0m";
        console.error(
          `${red}Error loading config: ${error.message || error}${reset}`
        );
        this.config = {};
      }
    } else {
      // Config file doesn't exist, use defaults
      this.config = {};
    }

    // Convert new config schema to legacy VectorConfig format
    return await this.buildLegacyConfig();
  }

  getConfigSource(): "user" | "default" {
    return this.configSource;
  }

  private async buildLegacyConfig(): Promise<VectorConfig<TTypes>> {
    const config: VectorConfig<TTypes> = {};

    // Direct mapping - schemas are now the same (flat)
    if (this.config) {
      config.port = this.config.port;
      config.hostname = this.config.hostname;
      config.reusePort = this.config.reusePort;
      config.development = this.config.development;
      config.routesDir = this.config.routesDir || "./routes";
      config.idleTimeout = this.config.idleTimeout;
    }

    // Always auto-discover routes
    config.autoDiscover = true;

    // CORS configuration
    if (this.config?.cors) {
      if (typeof this.config.cors === "boolean") {
        config.cors = this.config.cors
          ? {
              origin: "*",
              credentials: true,
              allowHeaders: "Content-Type, Authorization",
              allowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
              exposeHeaders: "Authorization",
              maxAge: 86400,
            }
          : undefined;
      } else {
        config.cors = this.config.cors as CorsOptions;
      }
    }

    // Middleware mapping (VectorConfig uses 'finally' instead of 'after')
    if (this.config?.before) {
      config.before = this.config.before;
    }

    if (this.config?.after) {
      config.finally = this.config.after;
    }

    return config;
  }

  async loadAuthHandler(): Promise<ProtectedHandler<TTypes> | null> {
    return this.config?.auth || null;
  }

  async loadCacheHandler(): Promise<CacheHandler | null> {
    return this.config?.cache || null;
  }

  getConfig(): VectorConfigSchema<TTypes> | null {
    return this.config;
  }
}
