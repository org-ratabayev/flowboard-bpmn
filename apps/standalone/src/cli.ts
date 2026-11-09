// Command line tools for the project database, using the same settings as the server
// (.env, environment, APP_CONFIG):
//
//   pnpm flowboard import --from <folder> [--dry-run]   import project folders (old layout)
//   pnpm flowboard export --to <folder>                 write all projects as project folders
//   pnpm flowboard deleted                              list deleted projects (soft delete)
//   pnpm flowboard restore <id>                         bring a deleted project back
//   pnpm flowboard purge <id> --yes                     permanently delete a deleted project

import path from 'node:path';
import { parseArgs } from 'node:util';
import { exportToFolder, importFromFolder, loadConfigFromEnv, openStore } from '@flowboard/server';
import { publicDir } from '@flowboard/web';

const USAGE = `Usage:
  pnpm flowboard import --from <folder> [--dry-run]
  pnpm flowboard export --to <folder>
  pnpm flowboard deleted
  pnpm flowboard restore <project-id>
  pnpm flowboard purge <project-id> --yes`;

const root = path.resolve(import.meta.dirname, '..', '..', '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch { /* no .env */ }

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    'dry-run': { type: 'boolean' },
    yes: { type: 'boolean' },
    help: { type: 'boolean' }
  }
});
const [command, projectId] = positionals;
const valid =
  (command === 'import' && !!values.from) ||
  (command === 'export' && !!values.to) ||
  (command === 'deleted' && positionals.length === 1) ||
  ((command === 'restore' || command === 'purge') && positionals.length === 2);
if (values.help || !valid) {
  console.error(USAGE);
  process.exit(values.help ? 0 : 1);
}
if (command === 'purge' && !values.yes) {
  console.error(`Purging removes the project "${projectId}" and all its history for good. Add --yes to confirm.`);
  process.exit(1);
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
  } else if (command === 'export') {
    const to = path.resolve(values.to!);
    const results = await exportToFolder(store, to);
    console.log(`Exported ${results.length} project(s) from ${target} to ${to}`);
    for (const r of results) console.log(`  ${r.id} (${r.versions} versions)`);
  } else if (command === 'deleted') {
    const deleted = await store.listDeletedProjects();
    console.log(`${deleted.length} deleted project(s) in ${target}`);
    for (const p of deleted) {
      console.log(`  ${p.id}  "${p.name}"  deleted ${p.deletedAt} by ${p.deletedBy?.name ?? 'unknown'}, owner ${p.owner?.name ?? 'none'}, ${p.versionCount} versions`);
    }
  } else if (command === 'restore') {
    if (!(await store.restoreProject(projectId))) throw new Error(`No deleted project with id "${projectId}" (see: pnpm flowboard deleted)`);
    console.log(`Restored ${projectId}: it is back for its owner and everyone it was shared with.`);
  } else {
    if (!(await store.purgeProject(projectId, null, { onlyDeleted: true, via: 'cli' }))) {
      throw new Error(`No deleted project with id "${projectId}" (only deleted projects can be purged here; see: pnpm flowboard deleted)`);
    }
    console.log(`Purged ${projectId}: the project and everything belonging to it are gone.`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await store.close();
}
