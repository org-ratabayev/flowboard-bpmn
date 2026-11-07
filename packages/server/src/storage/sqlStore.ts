// Projects and their version history in SQLite or Postgres (see migrations.ts for the schema).
// Ids and version names keep the format of the earlier folder storage, so links stay valid.

import { EMPTY_DIAGRAM } from '../bpmn.ts';
import { adoptUnowned, ROLE_SQL, type Role, type Visibility } from './accessStore.ts';
import { toIso, type Db, type Queryable } from './db.ts';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;

export const isProjectId = (id: string) => ID_RE.test(id);
export const isVersionName = (version: string) => VERSION_RE.test(version);

export interface ProjectMeta {
  name: string;
  createdAt: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  versionCount: number;
  /** Present when listed for a user. */
  role?: Role;
  visibility?: Visibility;
  owner?: { id: string; name: string } | null;
}

export interface VersionInfo {
  version: string;
  at: string;
  author: string | null;
  note: string | null;
  size: number;
}

export type VersionSource = 'editor' | 'restore' | 'import' | 'mcp' | 'ai';

export interface SaveOptions {
  /** Display name shown in the history. */
  author?: string | null;
  /** The user who saved (users.id). */
  authorId?: string | null;
  note?: string | null;
  /** Version the change is based on; the save is refused when it is no longer the latest. */
  baseVersion?: unknown;
  /** Save even when `baseVersion` is outdated. */
  force?: boolean;
  source?: VersionSource;
}

export type SaveResult =
  | { saved: { version: string; at: string } }
  | { conflict: VersionInfo | null };

export interface ImportedProject {
  /** Preferred id; a free one is derived from it when it is taken. */
  id: string;
  name: string;
  createdAt: string | null;
  /** Identifies the source so a repeated import skips it. */
  importKey: string;
  /** Oldest first. */
  versions: Array<{ name: string; at: string; xml: string; author: string | null; note: string | null }>;
}

export type DocumentStore = ReturnType<typeof createSqlStore>;

function slugify(name: string): string {
  return String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diagram';
}

interface VersionRow {
  name: string;
  created_at: unknown;
  author_name: string | null;
  note: string | null;
  size: number;
}

const toVersionInfo = (row: VersionRow): VersionInfo => ({
  version: row.name,
  at: toIso(row.created_at)!,
  author: row.author_name,
  note: row.note,
  size: Number(row.size)
});

async function freeId(q: Queryable, base: string): Promise<string> {
  let id = base;
  for (let n = 2; await q.get('SELECT id FROM documents WHERE id = $1', [id]); n++) id = `${base}-${n}`;
  return id;
}

async function latestVersion(q: Queryable, id: string): Promise<{ seq: number; info: VersionInfo } | null> {
  const row = await q.get<VersionRow & { seq: number }>(
    'SELECT seq, name, created_at, author_name, note, size FROM document_versions WHERE document_id = $1 ORDER BY seq DESC LIMIT 1',
    [id]
  );
  return row ? { seq: Number(row.seq), info: toVersionInfo(row) } : null;
}

async function insertVersion(
  q: Queryable,
  id: string,
  xml: string,
  { author, authorId, note, source = 'editor' }: SaveOptions
): Promise<{ version: string; at: string }> {
  const latest = await latestVersion(q, id);
  const now = new Date();
  const at = now.toISOString();
  const base = at.replace(/[:.]/g, '-');
  let version = base;
  for (let n = 1; await q.get('SELECT 1 FROM document_versions WHERE document_id = $1 AND name = $2', [id, version]); n++) {
    version = `${base}-${n}`;
  }
  await q.run(
    `INSERT INTO document_versions (document_id, seq, name, xml, author_name, author_id, note, size, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, (latest?.seq ?? 0) + 1, version, xml, author || null, authorId || null, note || null, Buffer.byteLength(xml), source, at]
  );
  await q.run('UPDATE documents SET updated_at = $2 WHERE id = $1', [id, at]);
  return { version, at };
}

export function createSqlStore(db: Db) {
  return {
    db,

    async hasProject(id: string): Promise<boolean> {
      if (!isProjectId(id)) return false;
      return db.read(async (q) => !!(await q.get('SELECT id FROM documents WHERE id = $1', [id])));
    },

    countProjects(): Promise<number> {
      return db.read(async (q) => Number((await q.get<{ n: unknown }>('SELECT COUNT(*) AS n FROM documents'))!.n));
    },

    /** Projects the user can see, with their role; without a user, every project (exports, CLI). */
    listProjects(userId?: string): Promise<ProjectSummary[]> {
      return db.read(async (q) => {
        const rows = await q.all<{
          id: string; name: string; created_at: unknown; updated_at: unknown; updated_by: string | null; version_count: unknown;
          role: Role; visibility: Visibility; owner_id: string | null; owner_name: string | null;
        }>(
          `SELECT d.id, d.name, d.created_at, d.updated_at, d.visibility, d.owner_id, o.name AS owner_name,
                  ${userId ? ROLE_SQL : `'owner'`} AS role,
                  (SELECT v.author_name FROM document_versions v WHERE v.document_id = d.id ORDER BY v.seq DESC LIMIT 1) AS updated_by,
                  (SELECT COUNT(*) FROM document_versions v WHERE v.document_id = d.id) AS version_count
           FROM documents d
           LEFT JOIN users o ON o.id = d.owner_id
           LEFT JOIN document_grants g ON g.document_id = d.id AND g.user_id = $1
           ${userId ? `WHERE d.owner_id = $1 OR g.role IS NOT NULL OR d.visibility = 'everyone'` : ''}
           ORDER BY d.updated_at DESC, d.id`,
          [userId ?? '']
        );
        return rows.map((r) => ({
          id: r.id,
          name: r.name || r.id,
          createdAt: toIso(r.created_at),
          updatedAt: toIso(r.updated_at)!,
          updatedBy: r.updated_by || null,
          versionCount: Number(r.version_count),
          ...(userId ? { role: r.role, visibility: r.visibility, owner: r.owner_id ? { id: r.owner_id, name: r.owner_name! } : null } : {})
        }));
      });
    },

    createProject(name: string, xml: string | undefined, author: string | null | undefined, authorId?: string | null): Promise<string> {
      return db.transaction(async (q) => {
        const id = await freeId(q, slugify(name));
        const now = new Date().toISOString();
        // new projects are private to their creator
        await q.run('INSERT INTO documents (id, name, created_at, updated_at, owner_id) VALUES ($1, $2, $3, $4, $5)', [id, name || id, now, now, authorId || null]);
        await insertVersion(q, id, xml || EMPTY_DIAGRAM, { author, authorId, note: 'Created' });
        return id;
      });
    },

    readMeta(id: string): Promise<ProjectMeta> {
      return db.read(async (q) => {
        const row = await q.get<{ name: string; created_at: unknown }>('SELECT name, created_at FROM documents WHERE id = $1', [id]);
        return { name: row?.name ?? id, createdAt: toIso(row?.created_at) };
      });
    },

    /** Sets the name when one is given (also an empty one, as before) and returns the metadata. */
    renameProject(id: string, name: string | undefined): Promise<ProjectMeta> {
      return db.transaction(async (q) => {
        if (name !== undefined) await q.run('UPDATE documents SET name = $2 WHERE id = $1', [id, name]);
        const row = await q.get<{ name: string; created_at: unknown }>('SELECT name, created_at FROM documents WHERE id = $1', [id]);
        return { name: row?.name ?? id, createdAt: toIso(row?.created_at) };
      });
    },

    /** XML of the latest version (or an empty diagram for a project without versions). */
    readLatest(id: string): Promise<string> {
      return db.read(async (q) => {
        const row = await q.get<{ xml: string }>('SELECT xml FROM document_versions WHERE document_id = $1 ORDER BY seq DESC LIMIT 1', [id]);
        return row?.xml ?? EMPTY_DIAGRAM;
      });
    },

    /** Newest first. */
    listVersions(id: string): Promise<VersionInfo[]> {
      return db.read(async (q) =>
        (await q.all<VersionRow>(
          'SELECT name, created_at, author_name, note, size FROM document_versions WHERE document_id = $1 ORDER BY seq DESC',
          [id]
        )).map(toVersionInfo)
      );
    },

    currentVersion(id: string): Promise<string | null> {
      return db.read(async (q) => (await latestVersion(q, id))?.info.version ?? null);
    },

    /** One saved version, or null when it does not exist. */
    readVersion(id: string, version: string): Promise<string | null> {
      return db.read(async (q) => {
        const row = await q.get<{ xml: string }>('SELECT xml FROM document_versions WHERE document_id = $1 AND name = $2', [id, version]);
        return row?.xml ?? null;
      });
    },

    /** Saves a new version unless `baseVersion` is outdated (checked atomically) and `force` is not set. */
    saveVersion(id: string, xml: string, options: SaveOptions = {}): Promise<SaveResult> {
      return db.transaction(async (q) => {
        if (db.dialect === 'postgres') await q.get('SELECT id FROM documents WHERE id = $1 FOR UPDATE', [id]);
        const latest = await latestVersion(q, id);
        if (!options.force && options.baseVersion !== (latest?.info.version ?? null)) return { conflict: latest?.info ?? null };
        return { saved: await insertVersion(q, id, xml, options) };
      });
    },

    /** Adds a project with its history in one transaction; skipped when the same source was imported before. */
    importProject(project: ImportedProject): Promise<{ id: string; status: 'imported' | 'skipped' }> {
      return db.transaction(async (q) => {
        const existing = await q.get<{ id: string }>('SELECT id FROM documents WHERE import_key = $1', [project.importKey]);
        if (existing) return { id: existing.id, status: 'skipped' as const };
        const id = await freeId(q, isProjectId(project.id) ? project.id : slugify(project.name));
        const latestAt = project.versions.at(-1)?.at ?? project.createdAt ?? new Date().toISOString();
        await q.run(
          'INSERT INTO documents (id, name, created_at, updated_at, import_key) VALUES ($1, $2, $3, $4, $5)',
          [id, project.name || id, project.createdAt, latestAt, project.importKey]
        );
        let seq = 0;
        for (const v of project.versions) {
          await q.run(
            `INSERT INTO document_versions (document_id, seq, name, xml, author_name, note, size, source, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'import', $8)`,
            [id, ++seq, v.name, v.xml, v.author, v.note, Buffer.byteLength(v.xml), v.at]
          );
        }
        // imported projects belong to the first user who signed in (or to them once they do)
        await adoptUnowned(q);
        return { id, status: 'imported' as const };
      });
    },

    close: () => db.close()
  };
}
