import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckpointPackager } from '../src/checkpoint/artifacts/packager';

const TEST_STORAGE_DIR = join(process.cwd(), '.vector/test-packager');

async function cleanup() {
  if (existsSync(TEST_STORAGE_DIR)) {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

async function writeVersionFixture(version: string): Promise<void> {
  const versionDir = join(TEST_STORAGE_DIR, version);
  await fs.mkdir(versionDir, { recursive: true });
  await fs.writeFile(join(versionDir, 'checkpoint.js'), 'console.log("ok");', 'utf-8');
}

describe('CheckpointPackager', () => {
  beforeEach(async () => {
    await cleanup();
    await fs.mkdir(TEST_STORAGE_DIR, { recursive: true });
  });

  afterEach(cleanup);

  it('writes .tar.gz archives when codec is gzip', async () => {
    await writeVersionFixture('1.0.0');
    const packager = new CheckpointPackager(TEST_STORAGE_DIR, 'gzip');

    const result = await packager.packageVersion('1.0.0');
    expect(result.archivePath).toBe('_archives/1.0.0.tar.gz');
    expect(result.codec).toBe('gzip');

    const archivePath = join(TEST_STORAGE_DIR, result.archivePath);
    expect(existsSync(archivePath)).toBe(true);
    const bytes = readFileSync(archivePath);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
  });

  it('writes .tar archives when codec is none', async () => {
    await writeVersionFixture('1.0.1');
    const packager = new CheckpointPackager(TEST_STORAGE_DIR, 'none');

    const result = await packager.packageVersion('1.0.1');
    expect(result.archivePath).toBe('_archives/1.0.1.tar');
    expect(result.codec).toBe('none');

    const archivePath = join(TEST_STORAGE_DIR, result.archivePath);
    expect(existsSync(archivePath)).toBe(true);
    const bytes = readFileSync(archivePath);
    expect(bytes[0] === 0x1f && bytes[1] === 0x8b).toBe(false);
  });
});
