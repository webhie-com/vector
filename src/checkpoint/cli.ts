import { parseArgs } from 'node:util';
import { CheckpointManager } from './manager';

export async function runCheckpointCli(argv: string[]): Promise<void> {
  const subcommand = argv[0];

  switch (subcommand) {
    case 'publish':
      return await cliPublish(argv.slice(1));
    case 'list':
      return await cliList(argv.slice(1));
    case 'rollback':
      return await cliRollback(argv.slice(1));
    case 'remove':
      return await cliRemove(argv.slice(1));
    default:
      printCheckpointHelp();
      if (subcommand) {
        console.error(`\nUnknown checkpoint command: ${subcommand}`);
      }
      process.exit(1);
  }
}

async function cliPublish(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      version: { type: 'string', short: 'v' },
      routes: { type: 'string', short: 'r', default: './routes' },
      storage: { type: 'string', short: 's' },
    },
    strict: true,
  });

  if (!values.version) {
    console.error('Error: --version is required for publish');
    console.error('Usage: vector checkpoint publish --version <ver> [--routes <dir>]');
    process.exit(1);
  }

  const manager = new CheckpointManager(values.storage ? { storageDir: values.storage } : undefined);

  try {
    console.log(`Publishing checkpoint ${values.version}...`);

    const manifest = await manager.publish({
      version: values.version,
      routesDir: values.routes!,
    });

    console.log(`Checkpoint ${manifest.version} published successfully.`);
    console.log(`  Bundle hash: ${manifest.bundleHash.slice(0, 12)}...`);
    console.log(`  Bundle size: ${formatBytes(manifest.bundleSize)}`);
    console.log(`  Routes: ${manifest.routes.length}`);
    console.log(`  Assets: ${manifest.assets.length}`);
  } catch (err: any) {
    console.error(`Failed to publish checkpoint: ${err.message}`);
    process.exit(1);
  }
}

async function cliList(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      storage: { type: 'string', short: 's' },
    },
    strict: true,
  });

  const manager = new CheckpointManager(values.storage ? { storageDir: values.storage } : undefined);

  const manifests = await manager.listVersions();
  const active = await manager.getActive();

  if (manifests.length === 0) {
    console.log('No checkpoints found.');
    return;
  }

  console.log('');
  console.log('  Version      Created                    Bundle Hash     Size       Status');
  console.log('  ─────────────────────────────────────────────────────────────────────────');

  for (const m of manifests) {
    const isActive = active?.version === m.version;
    const status = isActive ? '● active' : '  ';
    const hash = m.bundleHash.slice(0, 12);
    const size = formatBytes(m.bundleSize).padEnd(10);
    const created = new Date(m.createdAt).toISOString().replace('T', ' ').slice(0, 19);

    console.log(`  ${m.version.padEnd(12)} ${created}   ${hash}...   ${size} ${status}`);
  }

  console.log('');
}

async function cliRollback(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    options: {
      storage: { type: 'string', short: 's' },
    },
    strict: true,
    allowPositionals: true,
  });

  const version = positionals[0];
  if (!version) {
    console.error('Error: version argument is required');
    console.error('Usage: vector checkpoint rollback <version>');
    process.exit(1);
  }

  const manager = new CheckpointManager(values.storage ? { storageDir: values.storage } : undefined);

  try {
    await manager.setActive(version);
    console.log(`Active checkpoint set to ${version}.`);
    console.log('Note: Restart the server for the change to take effect.');
  } catch (err: any) {
    console.error(`Failed to rollback: ${err.message}`);
    process.exit(1);
  }
}

async function cliRemove(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    options: {
      storage: { type: 'string', short: 's' },
    },
    strict: true,
    allowPositionals: true,
  });

  const version = positionals[0];
  if (!version) {
    console.error('Error: version argument is required');
    console.error('Usage: vector checkpoint remove <version>');
    process.exit(1);
  }

  const manager = new CheckpointManager(values.storage ? { storageDir: values.storage } : undefined);

  try {
    await manager.remove(version);
    console.log(`Checkpoint ${version} removed.`);
  } catch (err: any) {
    console.error(`Failed to remove checkpoint: ${err.message}`);
    process.exit(1);
  }
}

function printCheckpointHelp(): void {
  console.log(`
Usage: vector checkpoint <command>

Commands:
  publish   --version <ver> [--routes <dir>]   Build and store a checkpoint
  list                                          List all stored checkpoints
  rollback  <version>                           Activate a specific checkpoint
  remove    <version>                           Delete a checkpoint

Options:
  -v, --version   Semver version string (e.g. 1.2.0)
  -r, --routes    Routes directory (default: ./routes)
  -s, --storage   Checkpoint storage dir (default: .vector/checkpoints)
`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
