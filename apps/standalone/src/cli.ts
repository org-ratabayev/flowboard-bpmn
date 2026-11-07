// Command line tools for the project database, using the same settings as the server
// (.env, environment, APP_CONFIG):
//
//   pnpm flowboard import --from <folder> [--dry-run]   import project folders (old layout)
//   pnpm flowboard export --to <folder>                 write all projects as project folders

import path from 'node:path';
import { parseArgs } from 'node:util';
import { exportToFolder, importFromFolder, loadConfigFromEnv, openStore } from '@flowboard/server';
import { publicDir } from '@flowboard/web';

const USAGE = `Usage:
  pnpm flowboard import --from <folder> [--dry-run]
  pnpm flowboard export --to <folder>`;

const root = path.resolve(import.meta.dirname, '..', '..', '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch { /* no .env */ }

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { from: { type: 'string' }, to: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } }
});
const command = positionals[0];
if (values.help || !['import', 'export'].includes(command) || (command === 'import' && !values.from) || (command === 'export' && !values.to)) {
  console.error(USAGE);
  process.exit(values.help ? 0 : 1);
}

const config = await loadConfigFromEnv({ defaults: { publicDir } });
const store = await openStore(config.storage);
const target = config.storage.kind === 'postgres' ? 'Postgres' : config.storage.sqlitePath;
try {
  if (command === 'import') {
    const from = path.resolve(values.from!);
    const results = await importFromFolder(store, from, { dryRun: values['dry-run'] });
    console.log(`${values['dry-run'] ? 'Dry run: ' : ''}importing from ${from} into ${target}`);
    for (const r of results) console.log(`  ${r.status.padEnd(12)} ${r.folder} → ${r.id} (${r.versions} versions)`);
    if (!results.length) console.log('  No project folders found.');
  } else {
    const to = path.resolve(values.to!);
    const results = await exportToFolder(store, to);
    console.log(`Exported ${results.length} project(s) from ${target} to ${to}`);
    for (const r of results) console.log(`  ${r.id} (${r.versions} versions)`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await store.close();
}
