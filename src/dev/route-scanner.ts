import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { GeneratedRoute } from '../types';

export class RouteScanner {
  private routesDir: string;

  constructor(routesDir = './routes') {
    this.routesDir = resolve(process.cwd(), routesDir);
  }

  async scan(): Promise<GeneratedRoute[]> {
    const routes: GeneratedRoute[] = [];

    try {
      await this.scanDirectory(this.routesDir, routes);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.warn(`Routes directory not found: ${this.routesDir}`);
        return [];
      }
      throw error;
    }

    return routes;
  }

  private async scanDirectory(dir: string, routes: GeneratedRoute[], basePath = ''): Promise<void> {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        const newBasePath = basePath ? `${basePath}/${entry}` : entry;
        await this.scanDirectory(fullPath, routes, newBasePath);
      } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
        const routePath = relative(this.routesDir, fullPath)
          .replace(/\.(ts|js)$/, '')
          .split(sep)
          .join('/');

        try {
          // Convert Windows paths to URLs for import
          const importPath =
            process.platform === 'win32' ? `file:///${fullPath.replace(/\\/g, '/')}` : fullPath;

          const module = await import(importPath);

          if (module.default && typeof module.default === 'function') {
            routes.push({
              name: 'default',
              path: fullPath,
              method: 'GET',
              options: {
                method: 'GET',
                path: `/${routePath}`,
                expose: true,
              },
            });
          }

          for (const [name, value] of Object.entries(module)) {
            if (name === 'default') continue;

            if (Array.isArray(value) && value.length >= 4) {
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
    if (typeof Bun !== 'undefined' && Bun.env.NODE_ENV === 'development') {
      console.log(`Watching for route changes in ${this.routesDir}`);

      setInterval(async () => {
        await callback();
      }, 1000);
    }
  }
}
