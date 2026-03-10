import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface BundleOptions {
  entrypointPath: string;
  outputDir: string;
  outputFile?: string;
}

export interface BundleResult {
  outputPath: string;
  hash: string;
  size: number;
}

export class CheckpointBundler {
  async bundle(options: BundleOptions): Promise<BundleResult> {
    const outfile = options.outputFile ?? 'checkpoint.js';

    const result = await Bun.build({
      entrypoints: [options.entrypointPath],
      outdir: options.outputDir,
      target: 'bun',
      format: 'esm',
      minify: true,
      naming: { entry: outfile },
    });

    if (!result.success) {
      const messages = result.logs.map((l) => l.message ?? String(l)).join('\n');
      throw new Error(`Checkpoint bundle failed:\n${messages}`);
    }

    const outputPath = join(options.outputDir, outfile);

    if (!existsSync(outputPath)) {
      // Bun.build may output with a different name; find the actual output
      const actualOutput = result.outputs.find((o) => o.kind === 'entry-point');
      if (actualOutput) {
        const actualPath = actualOutput.path;
        if (existsSync(actualPath)) {
          return this.hashFile(actualPath);
        }
      }
      throw new Error(`Bundle output not found at expected path: ${outputPath}`);
    }

    return this.hashFile(outputPath);
  }

  private async hashFile(path: string): Promise<BundleResult> {
    const file = Bun.file(path);
    const content = await file.arrayBuffer();
    const hashBuffer = Bun.SHA256.hash(new Uint8Array(content));
    const hashBytes = new Uint8Array(hashBuffer.buffer, hashBuffer.byteOffset, hashBuffer.byteLength);
    const hash = Buffer.from(hashBytes).toString('hex');

    return {
      outputPath: path,
      hash,
      size: content.byteLength,
    };
  }
}
