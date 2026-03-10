import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import type { CheckpointCompressionCodec } from '../types';
import { sha256Hex } from './hasher';
import type { CheckpointArtifactPackageRecord } from './types';

const ARCHIVE_DIR = '_archives';

export class CheckpointPackager {
  private storageDir: string;
  private codec: CheckpointCompressionCodec;

  constructor(storageDir: string, codec: CheckpointCompressionCodec = 'gzip') {
    this.storageDir = storageDir;
    this.codec = codec;
  }

  async packageVersion(version: string): Promise<CheckpointArtifactPackageRecord> {
    const versionDir = join(this.storageDir, version);
    const archiveRelPath = join(ARCHIVE_DIR, `${version}.tar.gz`).replace(/\\/g, '/');
    const archivePath = join(this.storageDir, archiveRelPath);
    await fs.mkdir(join(this.storageDir, ARCHIVE_DIR), { recursive: true });

    const files = await collectFiles(versionDir);
    const archiveBytes = await this.buildArchiveBytes(versionDir, archivePath, files);

    return {
      archivePath: archiveRelPath,
      archiveHash: sha256Hex(archiveBytes),
      archiveSize: archiveBytes.byteLength,
      codec: this.codec,
    };
  }

  private async buildArchiveBytes(versionDir: string, archivePath: string, files: string[]): Promise<Uint8Array> {
    const ArchiveCtor = (Bun as any).Archive;
    if (typeof ArchiveCtor === 'function') {
      const archiveEntries = Object.fromEntries(
        files.map((filePath) => {
          const rel = relative(versionDir, filePath).replace(/\\/g, '/');
          return [rel, Bun.file(filePath)];
        })
      );

      const archive = new ArchiveCtor(archiveEntries);
      const tarBytes = new Uint8Array(await archive.bytes());
      const archiveBytes = this.codec === 'gzip' ? Bun.gzipSync(tarBytes) : tarBytes;
      await Bun.write(archivePath, archiveBytes);
      return archiveBytes;
    }

    await this.buildArchiveWithTar(versionDir, archivePath, files);
    const bytes = await fs.readFile(archivePath);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private async buildArchiveWithTar(versionDir: string, archivePath: string, files: string[]): Promise<void> {
    const relFiles = files.map((filePath) => relative(versionDir, filePath));
    if (relFiles.length === 0) {
      throw new Error(`Cannot package checkpoint: no files found in "${versionDir}"`);
    }

    const tarArgs = this.codec === 'gzip' ? ['-czf', archivePath] : ['-cf', archivePath];
    const proc = Bun.spawn(['tar', ...tarArgs, '-C', versionDir, ...relFiles], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      return;
    }

    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to package checkpoint archive with tar (exit ${exitCode}): ${stderr.trim()}`);
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(root, files);
  return files.filter((filePath) => relative(root, filePath).replace(/\\/g, '/') !== 'manifest.json');
}

async function walk(dir: string, files: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}
