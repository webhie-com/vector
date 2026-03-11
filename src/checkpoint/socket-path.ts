import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const CHECKPOINT_SOCKET_FILE = 'run.sock';
const UNIX_SOCKET_PATH_MAX_BYTES = 103;

function toAbsolute(dir: string): string {
  return isAbsolute(dir) ? dir : resolve(dir);
}

function unixSocketWithinLimit(path: string): boolean {
  return Buffer.byteLength(path, 'utf8') <= UNIX_SOCKET_PATH_MAX_BYTES;
}

function socketFileName(storageDir: string, version: string): string {
  const versionLabel = version
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 12);

  const digest = createHash('sha256').update(storageDir).update('\0').update(version).digest('hex').slice(0, 16);
  const label = versionLabel.length > 0 ? `${versionLabel}-` : '';
  return `vector-${label}${digest}.sock`;
}

function candidateSocketRoots(): string[] {
  const roots = new Set<string>();
  const override = process.env.VECTOR_CHECKPOINT_SOCKET_DIR?.trim();
  if (override) {
    roots.add(toAbsolute(override));
  }

  // Prefer short, stable roots before os.tmpdir(), especially on macOS where tmpdir can be long.
  if (process.platform !== 'win32') {
    roots.add('/tmp');
    roots.add('/private/tmp');
  }

  roots.add(toAbsolute(tmpdir()));
  return [...roots];
}

export function resolveCheckpointSocketPath(storageDir: string, version: string): string {
  const defaultPath = join(storageDir, version, CHECKPOINT_SOCKET_FILE);
  if (process.platform === 'win32' || unixSocketWithinLimit(defaultPath)) {
    return defaultPath;
  }

  const fileName = socketFileName(storageDir, version);
  for (const root of candidateSocketRoots()) {
    const candidate = join(root, fileName);
    if (unixSocketWithinLimit(candidate)) {
      return candidate;
    }
  }

  // Last resort: retain deterministic socket naming even if the environment has unusually long temp paths.
  return join('/tmp', fileName);
}
