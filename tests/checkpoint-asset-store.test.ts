import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AssetStore } from '../src/checkpoint/asset-store';

const TEST_DIR = join(process.cwd(), '.vector/test-assets');
const FIXTURES_DIR = join(TEST_DIR, 'fixtures');

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
}

async function createFixture(name: string, content: string | Buffer): Promise<string> {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const path = join(FIXTURES_DIR, name);
  await fs.writeFile(path, content);
  return path;
}

describe('AssetStore', () => {
  let store: AssetStore;

  beforeEach(async () => {
    await cleanup();
    await fs.mkdir(TEST_DIR, { recursive: true });
    store = new AssetStore(TEST_DIR);
  });

  afterEach(cleanup);

  describe('addEmbedded', () => {
    it('returns correct hash and size for a small file', async () => {
      const filePath = await createFixture('small.json', '{"key":"value"}');
      const record = await store.addEmbedded('config/small.json', filePath);

      expect(record.type).toBe('embedded');
      expect(record.logicalPath).toBe('config/small.json');
      expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.size).toBe(15); // '{"key":"value"}'.length
      expect(record.contentHash).toBe(record.hash);
      expect(record.contentSize).toBe(record.size);
      expect(record.blobHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.blobPath).toContain('_assets/blobs/');
      expect(record.codec).toBe('gzip');
      expect(existsSync(record.storedPath)).toBe(true);
    });

    it('throws when file exceeds per-file budget (64KB)', async () => {
      const largeContent = Buffer.alloc(65 * 1024, 'x');
      const filePath = await createFixture('large.bin', largeContent);

      await expect(store.addEmbedded('assets/large.bin', filePath)).rejects.toThrow('exceeds');
    });

    it('accepts files at exactly the budget limit', async () => {
      const content = Buffer.alloc(64 * 1024, 'x');
      const filePath = await createFixture('exact.bin', content);

      const record = await store.addEmbedded('assets/exact.bin', filePath);
      expect(record.size).toBe(64 * 1024);
    });
  });

  describe('addSidecar', () => {
    it('copies file to content-addressed location', async () => {
      const filePath = await createFixture('data.csv', 'a,b,c\n1,2,3');
      const record = await store.addSidecar('data/report.csv', filePath);

      expect(record.type).toBe('sidecar');
      expect(record.logicalPath).toBe('data/report.csv');
      expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.blobHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.storedPath).toContain('_assets/blobs/');
      expect(record.storedPath).toEndWith('.gz');
      expect(existsSync(record.storedPath)).toBe(true);
    });

    it('is idempotent — same content produces same hash and path', async () => {
      const filePath1 = await createFixture('data1.csv', 'same content');
      const filePath2 = await createFixture('data2.csv', 'same content');

      const record1 = await store.addSidecar('v1/data.csv', filePath1);
      const record2 = await store.addSidecar('v2/data.csv', filePath2);

      expect(record1.hash).toBe(record2.hash);
      expect(record1.storedPath).toBe(record2.storedPath);
    });

    it('stores different content under different hashes', async () => {
      const filePath1 = await createFixture('a.txt', 'content A');
      const filePath2 = await createFixture('b.txt', 'content B');

      const record1 = await store.addSidecar('a.txt', filePath1);
      const record2 = await store.addSidecar('b.txt', filePath2);

      expect(record1.contentHash).not.toBe(record2.contentHash);
      expect(record1.storedPath).not.toBe(record2.storedPath);
    });

    it('handles large files without budget restriction', async () => {
      const largeContent = Buffer.alloc(200 * 1024, 'x'); // 200 KB
      const filePath = await createFixture('large.bin', largeContent);

      const record = await store.addSidecar('assets/large.bin', filePath);
      expect(record.size).toBe(200 * 1024);
      expect(existsSync(record.storedPath)).toBe(true);
    });

    it('rewrites stale blob when existing compressed content is corrupted', async () => {
      const filePath = await createFixture('data.json', '{"ok":true}');
      const first = await store.addSidecar('data/data.json', filePath);

      await fs.writeFile(first.storedPath, Bun.gzipSync(new TextEncoder().encode('corrupted')));

      const second = await store.addSidecar('data/data.json', filePath);
      const compressed = await fs.readFile(second.storedPath);
      const decompressed = Bun.gunzipSync(
        new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)
      );
      const text = new TextDecoder().decode(decompressed);
      expect(text).toBe('{"ok":true}');
    });
  });

  describe('collect', () => {
    it('processes both embedded and sidecar arrays', async () => {
      const embeddedFile = await createFixture('small.json', '{}');
      const sidecarFile = await createFixture('big.csv', 'a,b,c\n1,2,3\n4,5,6');

      const records = await store.collect([embeddedFile], [sidecarFile]);

      expect(records).toHaveLength(2);
      expect(records[0].type).toBe('embedded');
      expect(records[1].type).toBe('sidecar');
    });

    it('returns empty array for no assets', async () => {
      const records = await store.collect([], []);
      expect(records).toEqual([]);
    });
  });

  describe('validateBudgets', () => {
    it('passes when total embedded size is within budget', () => {
      const records = [
        { type: 'embedded' as const, logicalPath: 'a', storedPath: '/a', hash: 'x', size: 1024 },
        { type: 'embedded' as const, logicalPath: 'b', storedPath: '/b', hash: 'y', size: 2048 },
        { type: 'sidecar' as const, logicalPath: 'c', storedPath: '/c', hash: 'z', size: 1_000_000 },
      ];

      expect(() => store.validateBudgets(records)).not.toThrow();
    });

    it('throws when total embedded size exceeds budget (512KB)', () => {
      const records = [
        { type: 'embedded' as const, logicalPath: 'a', storedPath: '/a', hash: 'x', size: 300 * 1024 },
        { type: 'embedded' as const, logicalPath: 'b', storedPath: '/b', hash: 'y', size: 300 * 1024 },
      ];

      expect(() => store.validateBudgets(records)).toThrow('exceeds');
    });

    it('ignores sidecar assets in budget calculation', () => {
      const records = [
        { type: 'embedded' as const, logicalPath: 'a', storedPath: '/a', hash: 'x', size: 1024 },
        { type: 'sidecar' as const, logicalPath: 'b', storedPath: '/b', hash: 'y', size: 10_000_000 },
      ];

      expect(() => store.validateBudgets(records)).not.toThrow();
    });

    it('passes for empty records array', () => {
      expect(() => store.validateBudgets([])).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles empty file for embedded', async () => {
      const filePath = await createFixture('empty.txt', '');
      const record = await store.addEmbedded('empty.txt', filePath);

      expect(record.size).toBe(0);
      expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles file without extension for sidecar', async () => {
      const filePath = await createFixture('noext', 'data');
      const record = await store.addSidecar('configs/noext', filePath);

      expect(record.type).toBe('sidecar');
      expect(existsSync(record.storedPath)).toBe(true);
      expect(record.storedPath).toEndWith('.gz');
    });

    it('embedded idempotent — same content same hash', async () => {
      const filePath1 = await createFixture('dup1.json', '{"same":true}');
      const filePath2 = await createFixture('dup2.json', '{"same":true}');

      const record1 = await store.addEmbedded('a.json', filePath1);
      const record2 = await store.addEmbedded('b.json', filePath2);

      expect(record1.hash).toBe(record2.hash);
      expect(record1.storedPath).toBe(record2.storedPath);
    });
  });
});
