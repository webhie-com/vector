#!/usr/bin/env bun

import { watch } from "node:fs";
import { parseArgs } from "node:util";
import { getVectorInstance } from "../core/vector";
import { ConfigLoader } from "../core/config-loader";

// Compatibility layer for both Node and Bun
const args =
  typeof Bun !== "undefined" ? Bun.argv.slice(2) : process.argv.slice(2);

const { values, positionals } = parseArgs({
  args,
  options: {
    port: {
      type: "string",
      short: "p",
      default: "3000",
    },
    host: {
      type: "string",
      short: "h",
      default: "localhost",
    },
    routes: {
      type: "string",
      short: "r",
      default: "./routes",
    },
    watch: {
      type: "boolean",
      short: "w",
      default: true,
    },
    cors: {
      type: "boolean",
      default: true,
    },
    config: {
      type: "string",
      short: "c",
    },
  },
  strict: true,
  allowPositionals: true,
});

const command = positionals[0] || "dev";

async function runDev() {
  const isDev = command === "dev";

  let server: any = null;
  let vector: any = null;

  async function startServer(): Promise<{ server: any; vector: any; config: any }> {
    // Create a timeout promise that rejects after 10 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Server startup timed out (10s)"));
      }, 10000);
    });

    // Create the actual server start promise
    const serverStartPromise = (async (): Promise<{ server: any; vector: any; config: any }> => {
      // Load configuration using ConfigLoader
      const configLoader = new ConfigLoader(values.config as string | undefined);
      const config = await configLoader.load();

      // Merge CLI options with loaded config
      // Only use CLI values if config doesn't have them
      config.port = config.port ?? Number.parseInt(values.port as string);
      config.hostname = config.hostname ?? (values.host as string);
      config.routesDir = config.routesDir ?? (values.routes as string);
      config.development = config.development ?? isDev;
      config.autoDiscover = true; // Always auto-discover routes

      // Apply CLI CORS option if not explicitly set in config
      // Only apply default CORS if config.cors is undefined (not set)
      if (config.cors === undefined && values.cors) {
        config.cors = {
          origin: "*",
          credentials: true,
          allowHeaders: "Content-Type, Authorization",
          allowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          exposeHeaders: "Authorization",
          maxAge: 86400,
        };
      }

      // Get Vector instance and configure handlers
      vector = getVectorInstance();

      // Load and set auth handler if configured
      const authHandler = await configLoader.loadAuthHandler();
      if (authHandler) {
        vector.setProtectedHandler(authHandler);
      }

      // Load and set cache handler if configured
      const cacheHandler = await configLoader.loadCacheHandler();
      if (cacheHandler) {
        vector.setCacheHandler(cacheHandler);
      }

      // Start the server
      server = await vector.startServer(config);

      // Verify the server is actually running
      if (!server || !server.port) {
        throw new Error("Server started but is not responding correctly");
      }

      const cyan = "\x1b[36m";
      const reset = "\x1b[0m";

      console.log(
        `\nListening on ${cyan}http://${config.hostname}:${config.port}${reset}\n`
      );

      return { server, vector, config };
    })();

    // Race between server startup and timeout
    return await Promise.race([serverStartPromise, timeoutPromise]);
  }

  try {
    // Start the server initially
    const result = await startServer();
    server = result.server;

    // Setup file watching for hot reload
    if (isDev && values.watch) {
      try {
        let reloadTimeout: any = null;
        let isReloading = false;
        const changedFiles = new Set<string>();
        let lastReloadTime = 0;

        // Watch entire project directory for changes
        watch(process.cwd(), { recursive: true }, async (_, filename) => {
          // Skip if already reloading or if it's too soon after last reload
          const now = Date.now();
          if (isReloading || now - lastReloadTime < 1000) return;

          if (
            filename &&
            (filename.endsWith(".ts") ||
              filename.endsWith(".js") ||
              filename.endsWith(".json")) &&
            !filename.includes("node_modules") &&
            !filename.includes(".git") &&
            !filename.includes(".vector") && // Ignore generated files
            !filename.includes("dist") && // Ignore dist folder
            !filename.includes("bun.lockb") && // Ignore lock files
            !filename.endsWith(".generated.ts") // Ignore generated files
          ) {
            // Track changed files
            changedFiles.add(filename);

            // Debounce reload to avoid multiple restarts
            if (reloadTimeout) {
              clearTimeout(reloadTimeout);
            }

            reloadTimeout = setTimeout(async () => {
              if (isReloading || changedFiles.size === 0) return;

              isReloading = true;
              lastReloadTime = Date.now();

              // Clear changed files
              changedFiles.clear();

              // Stop the current server
              if (vector) {
                vector.stop();
              }

              // Small delay to ensure file system operations complete
              await new Promise((resolve) => setTimeout(resolve, 100));

              // Clear module cache to ensure fresh imports
              // Note: Bun uses ESM and doesn't have require.cache
              // The Loader API will handle module reloading automatically
              if (typeof require !== 'undefined' && require.cache) {
                for (const key in require.cache) {
                  if (!key.includes("node_modules")) {
                    delete require.cache[key];
                  }
                }
              }

              // Restart the server
              try {
                const result = await startServer();
                server = result.server;
                vector = result.vector;
              } catch (error: any) {
                console.error("\n[Reload Error]", error.message || error);
                // Don't exit the process on reload failures, just continue watching
              } finally {
                // Reset flag immediately after reload completes
                // The lastReloadTime check provides additional protection
                isReloading = false;
              }
            }, 500); // Increased debounce to 500ms
          }
        });
      } catch {
        const yellow = "\x1b[33m";
        const reset = "\x1b[0m";
        console.warn(`${yellow}Warning: File watching not available${reset}`);
      }
    }
  } catch (error: any) {
    const red = "\x1b[31m";
    const reset = "\x1b[0m";

    console.error(`\n${red}Error: ${error.message || error}${reset}\n`);

    if (error.stack && process.env.NODE_ENV === "development") {
      console.error(error.stack);
    }

    process.exit(1);
  }
}

async function runBuild() {
  try {
    const { RouteScanner } = await import("../dev/route-scanner");
    const { RouteGenerator } = await import("../dev/route-generator");

    // Step 1: Scan and generate routes
    const scanner = new RouteScanner(values.routes as string);
    const generator = new RouteGenerator();

    const routes = await scanner.scan();
    await generator.generate(routes);

    // Step 2: Build the application with Bun
    if (typeof Bun !== "undefined") {
      // Build the CLI as an executable
      const buildProcess = Bun.spawn([
        "bun",
        "build",
        "src/cli/index.ts",
        "--target",
        "bun",
        "--outfile",
        "dist/server.js",
        "--minify",
      ]);

      const exitCode = await buildProcess.exited;
      if (exitCode !== 0) {
        throw new Error(`Build failed with exit code ${exitCode}`);
      }
    } else {
      // For Node.js, use child_process
      const { spawnSync } = await import("child_process");
      const result = spawnSync(
        "bun",
        [
          "build",
          "src/cli/index.ts",
          "--target",
          "bun",
          "--outfile",
          "dist/server.js",
          "--minify",
        ],
        {
          stdio: "inherit",
          shell: true,
        }
      );

      if (result.status !== 0) {
        throw new Error(`Build failed with exit code ${result.status}`);
      }
    }

    console.log("\nBuild complete: dist/server.js\n");
  } catch (error: any) {
    const red = "\x1b[31m";
    const reset = "\x1b[0m";
    console.error(`\n${red}Error: ${error.message || error}${reset}\n`);
    process.exit(1);
  }
}

switch (command) {
  case "dev":
    await runDev();
    break;
  case "build":
    await runBuild();
    break;
  case "start":
    process.env.NODE_ENV = "production";
    await runDev();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.log(`
Usage: vector [command] [options]

Commands:
  dev     Start development server (default)
  build   Build for production
  start   Start production server

Options:
  -p, --port <port>      Port to listen on (default: 3000)
  -h, --host <host>      Hostname to bind to (default: localhost)
  -r, --routes <dir>     Routes directory (default: ./routes)
  -w, --watch            Watch for file changes (default: true)
  -c, --config <path>    Path to config file (default: vector.config.ts)
  --cors                 Enable CORS (default: true)
`);
    process.exit(1);
}
