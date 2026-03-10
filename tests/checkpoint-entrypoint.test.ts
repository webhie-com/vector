import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CheckpointEntrypointGenerator } from '../src/checkpoint/entrypoint-generator';

const TEST_OUTPUT_DIR = join(process.cwd(), '.vector/test-entrypoint');
const TEST_ROUTES_DIR = join(process.cwd(), 'tests/fixtures/routes');

async function cleanup() {
  if (existsSync(TEST_OUTPUT_DIR)) {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
}

function toImportSpecifier(fromDir: string, toFile: string): string {
  const normalized = relative(fromDir, toFile).split(sep).join('/');
  if (normalized.startsWith('.') || normalized.startsWith('/')) {
    return normalized;
  }
  return `./${normalized}`;
}

describe('CheckpointEntrypointGenerator', () => {
  beforeEach(async () => {
    await cleanup();
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(cleanup);

  it('generates an entrypoint file', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(outputPath).toEndWith('entrypoint.ts');
  });

  it('includes Bun.serve with unix socket', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('Bun.serve');
    expect(content).toContain('unix: socketPath');
  });

  it('includes version in generated source', async () => {
    const generator = new CheckpointEntrypointGenerator();

    await generator.generate({
      version: '2.5.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(join(TEST_OUTPUT_DIR, 'entrypoint.ts'), 'utf-8');
    expect(content).toContain('2.5.0');
  });

  it('includes READY signal for parent process', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain("process.stdout.write('READY\\n')");
  });

  it('includes health check endpoint', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('/_vector/health');
  });

  it('imports route files from routesDir via relative specifiers', async () => {
    const generator = new CheckpointEntrypointGenerator();

    await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(join(TEST_OUTPUT_DIR, 'entrypoint.ts'), 'utf-8');
    const expectedSpecifier = toImportSpecifier(TEST_OUTPUT_DIR, join(TEST_ROUTES_DIR, 'hello.ts'));
    expect(content).toContain(`from "${expectedSpecifier}";`);
    expect(content).toContain('hello');
  });

  it('records discovered routes', async () => {
    const generator = new CheckpointEntrypointGenerator();

    await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const routes = generator.getDiscoveredRoutes();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]).toHaveProperty('method');
    expect(routes[0]).toHaveProperty('path');
  });

  it('handles empty routes directory gracefully', async () => {
    const emptyDir = join(TEST_OUTPUT_DIR, 'empty-routes');
    await fs.mkdir(emptyDir, { recursive: true });

    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: emptyDir,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    expect(existsSync(outputPath)).toBe(true);
    const routes = generator.getDiscoveredRoutes();
    expect(routes).toHaveLength(0);
  });

  it('handles nonexistent routes directory gracefully', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: '/nonexistent/path',
      socketPath: '/tmp/test-checkpoint.sock',
    });

    expect(existsSync(outputPath)).toBe(true);
  });

  it('reads socket path from env var', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('VECTOR_CHECKPOINT_SOCKET');
  });

  it('hydrates ctx from forwarded checkpoint context header', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('x-vector-checkpoint-context');
    expect(content).toContain('const ctx: Record<string, unknown> = Object.create(null);');
    expect(content).toContain("setContextField(ctx, 'request', req)");
    expect(content).toContain(
      "const allowedCheckpointKeys = ['metadata', 'content', 'validatedInput', 'authUser'] as const;"
    );
    expect(content).toContain('function setContextField(');
    expect(content).toContain('parseCheckpointContext');
  });

  it('initializes params, query, cookies, and metadata defaults in createContext', async () => {
    const generator = new CheckpointEntrypointGenerator();

    const outputPath = await generator.generate({
      version: '1.0.0',
      outputDir: TEST_OUTPUT_DIR,
      routesDir: TEST_ROUTES_DIR,
      socketPath: '/tmp/test-checkpoint.sock',
    });

    const content = await fs.readFile(outputPath, 'utf-8');

    // params derived from req.params (Bun native route params) with fallback to {}
    expect(content).toContain('function extractRouteParams(');
    expect(content).toContain("setContextField(ctx, 'params', extractRouteParams(req))");

    // query parsed from URL searchParams
    expect(content).toContain('function parseQuery(');
    expect(content).toContain("setContextField(ctx, 'query', parseQuery(new URL(req.url)))");

    // cookies parsed from Cookie header
    expect(content).toContain('function parseCookies(');
    expect(content).toContain("setContextField(ctx, 'cookies', parseCookies(req.headers.get('cookie')))");

    // metadata initialized to empty object before forwarded context may override it
    expect(content).toContain("setContextField(ctx, 'metadata', {})");
  });
});
