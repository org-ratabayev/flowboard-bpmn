import type { Config } from '../config.ts';
import { migrate } from './migrations.ts';
import { openPostgres } from './postgresDb.ts';
import { openSqlite } from './sqliteDb.ts';
import { createSqlStore, type DocumentStore } from './sqlStore.ts';

/** Opens the configured database and applies pending migrations. */
export async function openStore(storage: Config['storage']): Promise<DocumentStore> {
  const db = storage.kind === 'postgres'
    ? openPostgres(storage.postgresUrl!, storage.postgresPoolSize)
    : openSqlite(storage.sqlitePath);
  try {
    await migrate(db);
  } catch (err) {
    await db.close().catch(() => {});
    throw err;
  }
  return createSqlStore(db);
}

export { exportToFolder, importFromFolder, readProjectFolder, type ImportResult } from './folder.ts';
export {
  createSqlStore,
  isProjectId,
  isVersionName,
  type DocumentStore,
  type ProjectMeta,
  type ProjectSummary,
  type SaveResult,
  type VersionInfo
} from './sqlStore.ts';
