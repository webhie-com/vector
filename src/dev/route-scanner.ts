import { existsSync, promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { GeneratedRoute } from "../types";

export class RouteScanner {
  private routesDir: string;
  private excludePatterns: string[];
  private static readonly DEFAULT_EXCLUDE_PATTERNS = [
    "*.test.ts",
    "*.test.js",
    "*.test.tsx",
    "*.test.jsx",
    "*.spec.ts",
    "*.spec.js",
    "*.spec.tsx",
    "*.spec.jsx",
    "*.tests.ts",
    "*.tests.js",
    "**/__tests__/**",
    "*.interface.ts",
    "*.type.ts",
    "*.d.ts",
  ];

  constructor(routesDir = "./routes", excludePatterns?: string[]) {
    // Always resolve from the current working directory (user's project)
    this.routesDir = resolve(process.cwd(), routesDir);
    this.excludePatterns =
      excludePatterns || RouteScanner.DEFAULT_EXCLUDE_PATTERNS;
  }

  async scan(): Promise<GeneratedRoute[]> {
    const routes: GeneratedRoute[] = [];

    // Check if routes directory exists before attempting to scan
    if (!existsSync(this.routesDir)) {
      return [];
    }

    try {
      await this.scanDirectory(this.routesDir, routes);
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        console.warn(`  ✗ Routes directory not accessible: ${this.routesDir}`);
        return [];
      }
      throw error;
    }

    return routes;
  }

  private isExcluded(filePath: string): boolean {
    const relativePath = relative(this.routesDir, filePath);

    for (const pattern of this.excludePatterns) {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\./g, "\\.") // Escape dots
        .replace(/\*/g, "[^/]*") // * matches anything except /
        .replace(/\*\*/g, ".*") // ** matches anything including /
        .replace(/\?/g, "."); // ? matches single character

      const regex = new RegExp(`^${regexPattern}$`);

      // Check both the full relative path and just the filename
      const filename = relativePath.split(sep).pop() || "";
      if (regex.test(relativePath) || regex.test(filename)) {
        return true;
      }
    }

    return false;
  }

  private async scanDirectory(
    dir: string,
    routes: GeneratedRoute[],
    basePath = ""
  ): Promise<void> {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        const newBasePath = basePath ? `${basePath}/${entry}` : entry;
        await this.scanDirectory(fullPath, routes, newBasePath);
      } else if (entry.endsWith(".ts") || entry.endsWith(".js")) {
        // Skip excluded files (test files, etc.)
        if (this.isExcluded(fullPath)) {
          continue;
        }
        const routePath = relative(this.routesDir, fullPath)
          .replace(/\.(ts|js)$/, "")
          .split(sep)
          .join("/");

        try {
          // Convert Windows paths to URLs for import
          const importPath =
            process.platform === "win32"
              ? `file:///${fullPath.replace(/\\/g, "/")}`
              : fullPath;

          const module = await import(importPath);

          if (module.default && typeof module.default === "function") {
            routes.push({
              name: "default",
              path: fullPath,
              method: "GET",
              options: {
                method: "GET",
                path: `/${routePath}`,
                expose: true,
              },
            });
          }

          for (const [name, value] of Object.entries(module)) {
            if (name === "default") continue;

            // Check for new RouteDefinition format
            if (
              value &&
              typeof value === "object" &&
              "entry" in value &&
              "options" in value &&
              "handler" in value
            ) {
              const routeDef = value as any;
              routes.push({
                name,
                path: fullPath,
                method: routeDef.options.method as string,
                options: routeDef.options,
              });
            }
            // Legacy RouteEntry format support
            else if (Array.isArray(value) && value.length >= 4) {
              const [method, , , path] = value;
              routes.push({
                name,
                path: fullPath,
                method: method as string,
                options: {
                  method: method as string,
                  path: path as string,
                  expose: true,
                },
              });
            }
          }
        } catch (error) {
          console.error(`Failed to load route from ${fullPath}:`, error);
        }
      }
    }
  }

  enableWatch(callback: () => void) {
    if (typeof Bun !== "undefined" && Bun.env.NODE_ENV === "development") {
      console.log(`Watching for route changes in ${this.routesDir}`);

      setInterval(async () => {
        await callback();
      }, 1000);
    }
  }
}
