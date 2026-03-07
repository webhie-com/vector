#!/usr/bin/env bun

import { existsSync, statSync, watch } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { getVectorInstance } from '../core/vector';
import { ConfigLoader } from '../core/config-loader';
import type { GeneratedRoute } from '../types';

declare const VECTOR_BAKED_CONFIG_JSON: string | undefined;

// Compatibility layer for both Node and Bun
const args = typeof Bun !== 'undefined' ? Bun.argv.slice(2) : process.argv.slice(2);
const BUN_EXECUTABLE = resolveBunExecutable();
const BUILT_START_ENV_FLAG = 'VECTOR_BUILT_START';
const BUILT_ROUTES_ENV_FLAG = 'VECTOR_BUILT_ROUTES_DIR';
const BUILT_SERVER_PATH = resolve(process.cwd(), 'dist/server.js');

const { values, positionals } = parseArgs({
  args,
  options: {
    port: {
      type: 'string',
      short: 'p',
      default: '3000',
    },
    host: {
      type: 'string',
      short: 'h',
      default: 'localhost',
    },
    routes: {
      type: 'string',
      short: 'r',
      default: './routes',
    },
    watch: {
      type: 'boolean',
      short: 'w',
      default: true,
    },
    cors: {
      type: 'boolean',
      default: true,
    },
    config: {
      type: 'string',
      short: 'c',
    },
    path: {
      type: 'string',
    },
  },
  strict: true,
  allowPositionals: true,
});

const command = positionals[0] || (typeof VECTOR_BAKED_CONFIG_JSON !== 'undefined' ? 'start' : 'dev');
const hasRoutesOption = args.some((arg) => arg === '--routes' || arg === '-r' || arg.startsWith('--routes='));
const hasHostOption = args.some((arg) => arg === '--host' || arg === '-h' || arg.startsWith('--host='));
const hasPortOption = args.some((arg) => arg === '--port' || arg === '-p' || arg.startsWith('--port='));
const hasConfigOption = args.some((arg) => arg === '--config' || arg === '-c' || arg.startsWith('--config='));

function exitWithCliError(message: string): never {
  console.error(message);
  process.exit(1);
}

function validateCommandOptionUsage(): void {
  if (command !== 'build' && command !== 'start' && values.path !== undefined) {
    exitWithCliError('--path can only be used with `vector build` or `vector start`.');
  }

  if (command === 'start' && hasConfigOption) {
    exitWithCliError(
      '--config is not supported for `vector start`. Set config at build time with `vector build --config`.'
    );
  }

  if (command === 'start' && hasRoutesOption) {
    exitWithCliError(
      '--routes is not supported for `vector start`. Set routes at build time with `vector build --routes`.'
    );
  }
}

function resolveBuildRoutesDir(configRoutesDir?: string): string {
  if (hasRoutesOption && values.routes) {
    return values.routes as string;
  }

  if (configRoutesDir) {
    return configRoutesDir;
  }

  if (values.routes) {
    return values.routes as string;
  }

  return './routes';
}

function resolveRoutesDir(configRoutesDir?: string): string {
  if (command === 'start' && !hasRoutesOption) {
    const builtRoutesDir = process.env[BUILT_ROUTES_ENV_FLAG];
    if (builtRoutesDir) {
      return builtRoutesDir;
    }

    const currentEntryPath = getCurrentEntryPath();
    if (currentEntryPath) {
      const entryRoutesDir = tryResolveRoutesDirFromBuildEntry(currentEntryPath);
      if (entryRoutesDir) {
        return entryRoutesDir;
      }

      if (typeof VECTOR_BAKED_CONFIG_JSON !== 'undefined') {
        const expectedRoutesDir = resolve(dirname(currentEntryPath), 'routes');
        throw new Error(`Built routes directory not found: ${expectedRoutesDir}`);
      }
    }
  }

  if (hasRoutesOption && values.routes) {
    return values.routes as string;
  }

  if (configRoutesDir) {
    return configRoutesDir;
  }

  if (values.routes) {
    return values.routes as string;
  }

  return './routes';
}

function resolvePort(configPort?: number): number {
  if (command === 'start' && hasPortOption) {
    const parsedPort = Number.parseInt(values.port as string, 10);
    if (!Number.isFinite(parsedPort)) {
      throw new Error(`Invalid port value: ${values.port as string}`);
    }
    return parsedPort;
  }

  if (configPort !== undefined) {
    return configPort;
  }

  return Number.parseInt(values.port as string, 10);
}

function resolveHost(configHost?: string): string {
  if (command === 'start' && hasHostOption) {
    return values.host as string;
  }

  if (configHost !== undefined) {
    return configHost;
  }

  return values.host as string;
}

function resolveBakedStartConfig(): Record<string, any> | null {
  if (typeof VECTOR_BAKED_CONFIG_JSON === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(VECTOR_BAKED_CONFIG_JSON) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function resolveRequestedBuildPath(): string | null {
  const configuredBuildPath = values.path as string | undefined;
  if (!configuredBuildPath) {
    return null;
  }

  return resolve(process.cwd(), configuredBuildPath);
}

function resolveBuildOutputDir(): string {
  const configuredBuildPath = values.path as string | undefined;
  const outputDir = configuredBuildPath ? resolve(process.cwd(), configuredBuildPath) : resolve(process.cwd(), 'dist');

  if (!existsSync(outputDir)) {
    return outputDir;
  }

  try {
    const stats = statSync(outputDir);
    if (!stats.isDirectory()) {
      throw new Error(`Build path must be a directory: ${outputDir}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to access build path: ${outputDir}`);
  }

  return outputDir;
}

function isSameOrNestedPath(candidatePath: string, basePath: string): boolean {
  const rel = relative(basePath, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function assertBuildPathSafety(sourceRoutesDir: string, buildOutputDir: string): void {
  const sourceRoutesRoot = resolve(process.cwd(), sourceRoutesDir);
  const buildRoutesDir = resolve(buildOutputDir, 'routes');

  if (isSameOrNestedPath(buildRoutesDir, sourceRoutesRoot) || isSameOrNestedPath(sourceRoutesRoot, buildRoutesDir)) {
    throw new Error(
      `Build output overlaps source routes. Use a separate --path.\nsource routes: ${sourceRoutesRoot}\noutput routes: ${buildRoutesDir}`
    );
  }
}

function tryResolveRoutesDirFromBuildEntry(buildEntryPath: string): string | null {
  const buildDir = dirname(buildEntryPath);
  const siblingRoutesDir = resolve(buildDir, 'routes');
  if (!existsSync(siblingRoutesDir)) {
    return null;
  }

  try {
    const stats = statSync(siblingRoutesDir);
    return stats.isDirectory() ? siblingRoutesDir : null;
  } catch {
    return null;
  }
}

function resolveRequiredRoutesDirFromBuildEntry(buildEntryPath: string): string {
  const routesDir = tryResolveRoutesDirFromBuildEntry(buildEntryPath);
  if (!routesDir) {
    throw new Error(`Build routes directory not found: ${resolve(dirname(buildEntryPath), 'routes')}`);
  }

  return routesDir;
}

function resolveBuildEntrypointFromPath(buildPath: string): { entryPath: string; routesDir: string } {
  if (!existsSync(buildPath)) {
    throw new Error(`Build path not found: ${buildPath}`);
  }

  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(buildPath);
  } catch {
    throw new Error(`Build path not found: ${buildPath}`);
  }

  if (stats.isDirectory()) {
    const entryPath = resolve(buildPath, 'server.js');
    if (!existsSync(entryPath)) {
      throw new Error(`Build entry not found: ${entryPath}`);
    }

    const routesDir = resolveRequiredRoutesDirFromBuildEntry(entryPath);
    return { entryPath, routesDir };
  }

  return {
    entryPath: buildPath,
    routesDir: resolveRequiredRoutesDirFromBuildEntry(buildPath),
  };
}

function serializeBakedConfig(config: Record<string, any>): string {
  return JSON.stringify(config, (_, value) => {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
      return undefined;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });
}

function resolveBunExecutable(): string {
  const fromExecPath = process.execPath;
  if (fromExecPath && fromExecPath.startsWith('/') && existsSync(fromExecPath)) {
    return fromExecPath;
  }

  if (typeof Bun !== 'undefined') {
    const bunWhich = Bun.which('bun');
    if (bunWhich && bunWhich.startsWith('/') && existsSync(bunWhich) && !bunWhich.includes('node_modules/.bin')) {
      return bunWhich;
    }
  }

  const commonPaths = ['/usr/local/bin/bun', '/usr/bin/bun', '/bin/bun'];
  for (const candidate of commonPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'bun';
}

async function runBunCommand(commandArgs: string[], context: string): Promise<void> {
  if (typeof Bun !== 'undefined') {
    const proc = Bun.spawn([BUN_EXECUTABLE, ...commandArgs], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`${context} failed with exit code ${exitCode}`);
    }
    return;
  }

  const { spawnSync } = await import('child_process');
  const result = spawnSync('bun', commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${context} failed with exit code ${result.status ?? 1}`);
  }
}

async function buildRouteBundles(
  routes: GeneratedRoute[],
  routesDir: string,
  outputRoutesDir: string
): Promise<number> {
  const uniqueRouteFiles = [...new Set(routes.map((route) => route.path))];
  if (uniqueRouteFiles.length === 0) {
    return 0;
  }

  const routesRoot = resolve(process.cwd(), routesDir);

  for (const routePath of uniqueRouteFiles) {
    const relativeRoutePath = relative(routesRoot, routePath).replace(/\\/g, '/');
    if (relativeRoutePath.startsWith('../') || relativeRoutePath === '..') {
      throw new Error(`Refusing to build route outside routesDir: ${routePath}`);
    }

    const outputBase = relativeRoutePath.replace(/\.(ts|js)$/, '');
    const outputPath = resolve(outputRoutesDir, `${outputBase}.js`);

    await mkdir(dirname(outputPath), { recursive: true });
    await runBunCommand(
      ['build', routePath, '--target', 'bun', '--format', 'esm', '--outfile', outputPath, '--minify'],
      `Route build for ${routePath}`
    );
  }

  return uniqueRouteFiles.length;
}

function getCurrentEntryPath(): string | null {
  const entryPath = typeof Bun !== 'undefined' ? Bun.main : process.argv[1];
  if (!entryPath) {
    return null;
  }
  return resolve(entryPath);
}

async function runBuiltStartIfAvailable(): Promise<number | null> {
  if (command !== 'start') {
    return null;
  }

  if (process.env[BUILT_START_ENV_FLAG] === '1') {
    return null;
  }

  const requestedBuildPath = resolveRequestedBuildPath();
  const currentEntryPath = getCurrentEntryPath();

  // If we're already executing a baked server entrypoint directly, do not redirect to dist/server.js.
  if (
    !requestedBuildPath &&
    currentEntryPath &&
    currentEntryPath !== BUILT_SERVER_PATH &&
    typeof VECTOR_BAKED_CONFIG_JSON !== 'undefined'
  ) {
    return null;
  }

  let buildServerPath = BUILT_SERVER_PATH;
  let resolvedRoutesDir = '';

  if (requestedBuildPath) {
    const resolvedBuild = resolveBuildEntrypointFromPath(requestedBuildPath);
    buildServerPath = resolvedBuild.entryPath;
    resolvedRoutesDir = resolvedBuild.routesDir;
  } else if (!existsSync(buildServerPath)) {
    throw new Error(`Built server not found: ${buildServerPath}. Run \`vector build\` first or pass --path.`);
  } else {
    resolvedRoutesDir = resolveRequiredRoutesDirFromBuildEntry(buildServerPath);
  }

  if (currentEntryPath && currentEntryPath === buildServerPath) {
    return null;
  }

  const childArgs = [buildServerPath, ...args];
  const childEnv = {
    ...process.env,
    [BUILT_START_ENV_FLAG]: '1',
    [BUILT_ROUTES_ENV_FLAG]: resolvedRoutesDir,
  } as NodeJS.ProcessEnv;

  if (typeof Bun !== 'undefined') {
    const proc = Bun.spawn([BUN_EXECUTABLE, ...childArgs], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      env: childEnv,
    });
    return await proc.exited;
  }

  const { spawnSync } = await import('child_process');
  const result = spawnSync('bun', childArgs, {
    stdio: 'inherit',
    env: childEnv,
  });
  return result.status ?? 1;
}

async function runDev() {
  const isDev = command === 'dev';

  let server: any = null;
  let vector: any = null;

  async function startServer(): Promise<{ server: any; vector: any; config: any }> {
    // Create a timeout promise that rejects after 10 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Server startup timed out (10s)'));
      }, 10000);
    });

    // Create the actual server start promise
    const serverStartPromise = (async (): Promise<{ server: any; vector: any; config: any }> => {
      const explicitConfigPath = values.config as string | undefined;
      const bakedStartConfig =
        command === 'start' && explicitConfigPath === undefined ? resolveBakedStartConfig() : null;
      const shouldLoadConfig = bakedStartConfig === null && (command !== 'start' || explicitConfigPath !== undefined);
      const configLoader = shouldLoadConfig ? new ConfigLoader(explicitConfigPath) : null;
      const loadedConfig = configLoader ? await configLoader.load() : {};
      const config = { ...(bakedStartConfig ?? loadedConfig) } as Record<string, any>;

      // Merge CLI options with loaded config.
      // Explicit --port/--host always override config values.
      config.port = resolvePort(config.port);
      config.hostname = resolveHost(config.hostname);
      config.routesDir = resolveRoutesDir(config.routesDir);
      config.development = config.development ?? isDev;
      config.autoDiscover = true; // Always auto-discover routes

      // Apply CLI CORS option if not explicitly set in config
      // Only apply default CORS if config.cors is undefined (not set)
      if (config.cors === undefined && values.cors) {
        config.cors = {
          origin: '*',
          credentials: true,
          allowHeaders: 'Content-Type, Authorization',
          allowMethods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          exposeHeaders: 'Authorization',
          maxAge: 86400,
        };
      }

      // Get Vector instance and configure handlers
      vector = getVectorInstance();

      // Load and set auth handler if configured
      const authHandler = configLoader ? await configLoader.loadAuthHandler() : null;
      if (authHandler) {
        vector.setProtectedHandler(authHandler);
      }

      // Load and set cache handler if configured
      const cacheHandler = configLoader ? await configLoader.loadCacheHandler() : null;
      if (cacheHandler) {
        vector.setCacheHandler(cacheHandler);
      }

      // Start the server
      server = await vector.startServer(config);

      // Verify the server is actually running
      if (!server || !server.port) {
        throw new Error('Server started but is not responding correctly');
      }

      const cyan = '\x1b[36m';
      const reset = '\x1b[0m';

      console.log(`\nListening on ${cyan}http://${config.hostname}:${config.port}${reset}\n`);

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

          const segments = filename ? filename.split(/[/\\]/) : [];
          const excluded = segments.some((s) => ['node_modules', '.git', '.vector', 'dist'].includes(s));
          if (
            filename &&
            (filename.endsWith('.ts') || filename.endsWith('.js') || filename.endsWith('.json')) &&
            !excluded &&
            !filename.includes('bun.lockb') && // Ignore lock files
            !filename.endsWith('.generated.ts') // Ignore generated files
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

              // Restart the server
              try {
                const result = await startServer();
                server = result.server;
                vector = result.vector;
              } catch (error: any) {
                console.error('\n[Reload Error]', error.message || error);
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
        const yellow = '\x1b[33m';
        const reset = '\x1b[0m';
        console.warn(`${yellow}Warning: File watching not available${reset}`);
      }
    }
  } catch (error: any) {
    const red = '\x1b[31m';
    const reset = '\x1b[0m';

    console.error(`\n${red}Error: ${error.message || error}${reset}\n`);

    if (error.stack && process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }

    process.exit(1);
  }
}

async function runBuild() {
  try {
    const { RouteScanner } = await import('../dev/route-scanner');
    const { RouteGenerator } = await import('../dev/route-generator');
    const buildConfigPath = values.config as string | undefined;
    if (buildConfigPath) {
      const explicitConfigPath = resolve(process.cwd(), buildConfigPath);
      if (!existsSync(explicitConfigPath)) {
        throw new Error(`Config file not found: ${explicitConfigPath}`);
      }
    }

    const configLoader = new ConfigLoader(buildConfigPath);
    const config = await configLoader.load();
    if (buildConfigPath && configLoader.getConfigSource() !== 'user') {
      throw new Error(`Failed to load explicit config: ${buildConfigPath}`);
    }

    const routesDir = resolveBuildRoutesDir(config.routesDir);
    if (hasRoutesOption) {
      const explicitRoutesDir = resolve(process.cwd(), routesDir);
      if (!existsSync(explicitRoutesDir)) {
        throw new Error(`Routes directory not found: ${explicitRoutesDir}`);
      }
    }

    const buildOutputDir = resolveBuildOutputDir();
    const buildServerPath = resolve(buildOutputDir, 'server.js');
    const buildRoutesDir = resolve(buildOutputDir, 'routes');
    assertBuildPathSafety(routesDir, buildOutputDir);

    // Ensure route bundles are deterministic by removing stale compiled files first.
    await rm(buildRoutesDir, { recursive: true, force: true });
    await mkdir(buildRoutesDir, { recursive: true });

    // Step 1: Scan and generate routes
    const scanner = new RouteScanner(routesDir, config.routeExcludePatterns);
    const generator = new RouteGenerator();

    const routes = await scanner.scan();
    await generator.generate(routes);
    const bundledRouteCount = await buildRouteBundles(routes, routesDir, buildRoutesDir);
    const bakedConfigPayload = serializeBakedConfig({
      ...config,
      routesDir,
    });

    // Step 2: Build the server entrypoint
    await mkdir(buildOutputDir, { recursive: true });
    await runBunCommand(
      [
        'build',
        'src/cli/index.ts',
        '--target',
        'bun',
        '--outfile',
        buildServerPath,
        '--minify',
        '--define',
        `VECTOR_BAKED_CONFIG_JSON=${JSON.stringify(bakedConfigPayload)}`,
      ],
      'Server build'
    );

    const routeLabel = bundledRouteCount === 1 ? 'route file' : 'route files';
    const buildServerDisplay = relative(process.cwd(), buildServerPath) || '.';
    const buildRoutesDisplay = relative(process.cwd(), buildRoutesDir) || '.';
    console.log(
      `\nBuild complete: ${buildServerDisplay} + ${buildRoutesDisplay} (${bundledRouteCount} ${routeLabel})\n`
    );
  } catch (error: any) {
    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    console.error(`\n${red}Error: ${error.message || error}${reset}\n`);
    process.exit(1);
  }
}

validateCommandOptionUsage();

switch (command) {
  case 'dev':
    await runDev();
    break;
  case 'build':
    await runBuild();
    break;
  case 'start': {
    let builtStartExitCode: number | null = null;
    try {
      builtStartExitCode = await runBuiltStartIfAvailable();
    } catch (error: any) {
      const red = '\x1b[31m';
      const reset = '\x1b[0m';
      console.error(`\n${red}Error: ${error.message || error}${reset}\n`);
      process.exit(1);
    }
    if (builtStartExitCode !== null) {
      process.exit(builtStartExitCode);
    }
    process.env.NODE_ENV = 'production';
    await runDev();
    break;
  }
  default:
    console.error(`Unknown command: ${command}`);
    console.log(`
Usage: vector [command] [options]

Commands:
  dev     Start development server (default)
  build   Build for production
  start   Start production server from build artifacts

Options:
  -p, --port <port>      Port to listen on (default: 3000)
  -h, --host <host>      Hostname to bind to (default: localhost)
  -r, --routes <dir>     Routes directory (dev/build)
  -w, --watch            Watch for file changes (default: true)
  -c, --config <path>    Path to config file (dev/build)
  --path <path>          Build output dir (build) or built app path (start), default: ./dist
  --cors                 Enable CORS (default: true)
`);
    process.exit(1);
}
