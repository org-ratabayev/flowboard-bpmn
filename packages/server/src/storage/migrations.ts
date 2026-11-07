import type { Db, Dialect } from './db.ts';

// Each migration has the same id in both dialects; applied ids are recorded in schema_migrations.
// Never edit an applied migration: add a new one.

interface SchemaChange {
  id: string;
  sql: Record<Dialect, string>;
}

const SCHEMA_CHANGES: SchemaChange[] = [
  {
    id: '001_documents',
    sql: {
      sqlite: `
        CREATE TABLE documents (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          created_at  TEXT,
          updated_at  TEXT NOT NULL,
          import_key  TEXT UNIQUE
        );
        CREATE TABLE document_versions (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          seq         INTEGER NOT NULL,
          name        TEXT NOT NULL,
          xml         TEXT NOT NULL,
          author_name TEXT,
          note        TEXT,
          size        INTEGER NOT NULL,
          source      TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          PRIMARY KEY (document_id, seq),
          UNIQUE (document_id, name)
        );
        CREATE INDEX documents_updated_at_idx ON documents (updated_at);
      `,
      postgres: `
        CREATE TABLE documents (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          created_at  TIMESTAMPTZ,
          updated_at  TIMESTAMPTZ NOT NULL,
          import_key  TEXT UNIQUE
        );
        CREATE TABLE document_versions (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          seq         INTEGER NOT NULL,
          name        TEXT NOT NULL,
          xml         TEXT NOT NULL,
          author_name TEXT,
          note        TEXT,
          size        INTEGER NOT NULL,
          source      TEXT NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (document_id, seq),
          UNIQUE (document_id, name)
        );
        CREATE INDEX documents_updated_at_idx ON documents (updated_at);
      `
    }
  },
  {
    id: '002_users_sessions',
    sql: {
      sqlite: `
        CREATE TABLE users (
          id           TEXT PRIMARY KEY,
          provider     TEXT NOT NULL,
          subject      TEXT NOT NULL,
          name         TEXT NOT NULL,
          email        TEXT,
          created_at   TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          UNIQUE (provider, subject)
        );
        CREATE TABLE sessions (
          token_hash   TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at   TEXT NOT NULL,
          expires_at   TEXT NOT NULL
        );
        CREATE INDEX sessions_user_id_idx ON sessions (user_id);
        ALTER TABLE document_versions ADD COLUMN author_id TEXT REFERENCES users(id) ON DELETE SET NULL;
      `,
      postgres: `
        CREATE TABLE users (
          id           TEXT PRIMARY KEY,
          provider     TEXT NOT NULL,
          subject      TEXT NOT NULL,
          name         TEXT NOT NULL,
          email        TEXT,
          created_at   TIMESTAMPTZ NOT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL,
          UNIQUE (provider, subject)
        );
        CREATE TABLE sessions (
          token_hash   TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at   TIMESTAMPTZ NOT NULL,
          expires_at   TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX sessions_user_id_idx ON sessions (user_id);
        ALTER TABLE document_versions ADD COLUMN author_id TEXT REFERENCES users(id) ON DELETE SET NULL;
      `
    }
  }
];

/** Applies pending migrations in one transaction; returns the ids it applied. */
export function migrate(db: Db): Promise<string[]> {
  return db.transaction(async (q) => {
    // Several server instances may start at once against the same Postgres database.
    if (db.dialect === 'postgres') await q.get('SELECT pg_advisory_xact_lock(724130001)');
    await q.run('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set((await q.all<{ id: string }>('SELECT id FROM schema_migrations')).map((r) => r.id));
    const applied: string[] = [];
    for (const change of SCHEMA_CHANGES) {
      if (done.has(change.id)) continue;
      for (const statement of change.sql[db.dialect].split(';').map((s) => s.trim()).filter(Boolean)) {
        await q.run(statement);
      }
      await q.run('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [change.id, new Date().toISOString()]);
      applied.push(change.id);
    }
    return applied;
  });
}
