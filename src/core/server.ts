import type { Server } from "bun";
import { cors } from "itty-router";
import type {
  CorsOptions,
  DefaultVectorTypes,
  VectorConfig,
  VectorTypes,
} from "../types";
import type { VectorRouter } from "./router";

export class VectorServer<TTypes extends VectorTypes = DefaultVectorTypes> {
  private server: Server | null = null;
  private router: VectorRouter<TTypes>;
  private config: VectorConfig<TTypes>;
  private corsHandler: any;

  constructor(router: VectorRouter<TTypes>, config: VectorConfig<TTypes>) {
    this.router = router;
    this.config = config;

    if (config.cors) {
      const { preflight, corsify } = cors(
        this.normalizeCorsOptions(config.cors)
      );
      this.corsHandler = { preflight, corsify };
    }
  }

  private normalizeCorsOptions(options: CorsOptions): any {
    return {
      origin: options.origin || "*",
      credentials: options.credentials !== false,
      allowHeaders: Array.isArray(options.allowHeaders)
        ? options.allowHeaders.join(", ")
        : options.allowHeaders || "Content-Type, Authorization",
      allowMethods: Array.isArray(options.allowMethods)
        ? options.allowMethods.join(", ")
        : options.allowMethods || "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      exposeHeaders: Array.isArray(options.exposeHeaders)
        ? options.exposeHeaders.join(", ")
        : options.exposeHeaders || "Authorization",
      maxAge: options.maxAge || 86400,
    };
  }

  async start(): Promise<Server> {
    const port = this.config.port || 3000;
    const hostname = this.config.hostname || "localhost";

    const fetch = async (request: Request): Promise<Response> => {
      try {
        // Handle CORS preflight
        if (this.corsHandler && request.method === "OPTIONS") {
          return this.corsHandler.preflight(request);
        }

        // Try to handle the request with our router
        let response = await this.router.handle(request);

        // Apply CORS headers if configured
        if (this.corsHandler) {
          response = this.corsHandler.corsify(response, request);
        }

        return response;
      } catch (error) {
        console.error("Server error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    };

    this.server = Bun.serve({
      port,
      hostname,
      reusePort: this.config.reusePort !== false,
      fetch,
      idleTimeout: this.config.idleTimeout || 60,
      error: (error) => {
        console.error("[ERROR] Server error:", error);
        return new Response("Internal Server Error", { status: 500 });
      },
    });

    // Server logs are handled by CLI, keep this minimal
    console.log(`→ Vector server running at http://${hostname}:${port}`);

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
      console.log("Server stopped");
    }
  }

  getServer(): Server | null {
    return this.server;
  }

  getPort(): number {
    return this.server?.port || this.config.port || 3000;
  }

  getHostname(): string {
    return this.server?.hostname || this.config.hostname || "localhost";
  }

  getUrl(): string {
    const port = this.getPort();
    const hostname = this.getHostname();
    return `http://${hostname}:${port}`;
  }
}
