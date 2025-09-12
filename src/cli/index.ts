#!/usr/bin/env bun

import { watch } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import vector from "../core/vector";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
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

  const config: any = {
    port: Number.parseInt(values.port as string),
    hostname: values.host as string,
    routesDir: values.routes as string,
    development: isDev,
    autoDiscover: true,
    cors: values.cors
      ? {
          origin: "*",
          credentials: true,
          allowHeaders: "Content-Type, Authorization",
          allowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          exposeHeaders: "Authorization",
          maxAge: 86400,
        }
      : undefined,
  };

  try {
    const userConfigPath = join(process.cwd(), "vector.config.ts");
    try {
      const userConfig = await import(userConfigPath);
      if (userConfig.default) {
        // Properly merge config, preserving middleware arrays
        const {
          before,
          finally: finallyMiddleware,
          ...otherConfig
        } = userConfig.default;

        // Merge non-middleware config
        Object.assign(config, otherConfig);

        // Handle middleware arrays properly - these need to be set after Object.assign
        // to avoid being overwritten
        if (before) {
          config.before = before;
        }
        if (finallyMiddleware) {
          config.finally = finallyMiddleware;
        }
      }
    } catch {
      // No user config file, use defaults
    }

    await vector.serve(config);

    const gray = "\x1b[90m";
    const reset = "\x1b[0m";
    const cyan = "\x1b[36m";
    const green = "\x1b[32m";

    console.log(`  ${gray}Routes${reset}     ${config.routesDir}`);
    if (isDev && values.watch) {
      console.log(`  ${gray}Watching${reset}   All project files`);

      try {
        // Watch entire project directory for changes
        watch(process.cwd(), { recursive: true }, async (_, filename) => {
          if (
            filename &&
            (filename.endsWith(".ts") ||
              filename.endsWith(".js") ||
              filename.endsWith(".json"))
          ) {
            console.log(`\n  🔄 File changed: ${filename}`);
            console.log("  🔄 Restarting server...\n");

            // Exit the current process, which will trigger a restart if using --watch flag
            process.exit(0);
          }
        });
      } catch (err) {
        console.warn("  ⚠️  File watching not available");
      }
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

    const buildProcess = Bun.spawn([
      "bun",
      "build",
      "src/index.ts",
      "--outdir",
      "dist",
      "--minify",
    ]);
    await buildProcess.exited;

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
