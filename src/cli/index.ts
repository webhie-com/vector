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
  },
  strict: true,
  allowPositionals: true,
});

const command = positionals[0] || "dev";

async function runDev() {
  const isDev = command === "dev";
  console.log(
    `\n→ Starting Vector ${isDev ? "development" : "production"} server\n`
  );

  let server: any = null;
  let vector: any = null;

  async function startServer() {
    try {
      // Load configuration using ConfigLoader
      const configLoader = new ConfigLoader();
      const config = await configLoader.load();
      const configSource = configLoader.getConfigSource();

      // Merge CLI options with loaded config
      // Only use CLI values if config doesn't have them
      config.port = config.port ?? Number.parseInt(values.port as string);
      config.hostname = config.hostname ?? (values.host as string);
      config.routesDir = config.routesDir ?? (values.routes as string);
      config.development = isDev;
      config.autoDiscover = true;

      // Apply CLI CORS option if not set in config
      if (!config.cors && values.cors) {
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

      const gray = "\x1b[90m";
      const reset = "\x1b[0m";
      const cyan = "\x1b[36m";
      const green = "\x1b[32m";

      console.log(
        `  ${gray}Config${reset}     ${
          configSource === "user" ? "User config loaded" : "Using defaults"
        }`
      );
      console.log(`  ${gray}Routes${reset}     ${config.routesDir}`);
      if (isDev && values.watch) {
        console.log(`  ${gray}Watching${reset}   All project files`);
      }
      console.log(
        `  ${gray}CORS${reset}       ${values.cors ? "Enabled" : "Disabled"}`
      );
      console.log(
        `  ${gray}Mode${reset}       ${isDev ? "Development" : "Production"}\n`
      );
      console.log(
        `  ${green}Ready${reset} → ${cyan}http://${config.hostname}:${config.port}${reset}\n`
      );

      return { server, vector, config };
    } catch (error) {
      console.error("[ERROR] Failed to start server:", error);
      throw error;
    }
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
              for (const key in require.cache) {
                if (!key.includes("node_modules")) {
                  delete require.cache[key];
                }
              }

              // Restart the server
              try {
                const result = await startServer();
                server = result.server;
                vector = result.vector;
              } catch (error) {
                console.error("  ❌ Failed to reload server:", error);
              } finally {
                // Reset flag after a delay
                setTimeout(() => {
                  isReloading = false;
                }, 2000); // 2 second cooldown
              }
            }, 500); // Increased debounce to 500ms
          }
        });
      } catch (err) {
        console.warn("  ⚠️  File watching not available");
      }
    }
  } catch (error) {
    console.error("[ERROR] Failed to start server:", error);
    process.exit(1);
  }
}

async function runBuild() {
  console.log("\n→ Building Vector application\n");

  try {
    const { RouteScanner } = await import("../dev/route-scanner");
    const { RouteGenerator } = await import("../dev/route-generator");

    const scanner = new RouteScanner(values.routes as string);
    const generator = new RouteGenerator();

    const routes = await scanner.scan();
    await generator.generate(routes);

    console.log(`  Generated ${routes.length} routes`);

    // Use spawn based on runtime
    if (typeof Bun !== "undefined") {
      const buildProcess = Bun.spawn([
        "bun",
        "build",
        "src/index.ts",
        "--outdir",
        "dist",
        "--minify",
      ]);
      await buildProcess.exited;
    } else {
      // For Node.js, use child_process
      const { spawnSync } = await import("child_process");
      spawnSync(
        "bun",
        ["build", "src/index.ts", "--outdir", "dist", "--minify"],
        {
          stdio: "inherit",
          shell: true,
        }
      );
    }

    console.log("\n  ✓ Build complete\n");
  } catch (error) {
    console.error("[ERROR] Build failed:", error);
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
  --cors                 Enable CORS (default: true)
`);
    process.exit(1);
}
