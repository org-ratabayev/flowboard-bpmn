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
  },
  {
    // One-time state of a sign-in with an external provider, between the redirect and the callback.
    id: '003_auth_flows',
    sql: {
      sqlite: `
        CREATE TABLE auth_flows (
          state_hash    TEXT PRIMARY KEY,
          code_verifier TEXT NOT NULL,
          nonce         TEXT NOT NULL,
          return_to     TEXT NOT NULL,
          expires_at    TEXT NOT NULL
        );
      `,
      postgres: `
        CREATE TABLE auth_flows (
          state_hash    TEXT PRIMARY KEY,
          code_verifier TEXT NOT NULL,
          nonce         TEXT NOT NULL,
          return_to     TEXT NOT NULL,
          expires_at    TIMESTAMPTZ NOT NULL
        );
      `
    }
  },
  {
    // Personal access tokens for API and MCP clients; only a hash of each token is stored.
    id: '004_access_tokens',
    sql: {
      sqlite: `
        CREATE TABLE access_tokens (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name         TEXT NOT NULL,
          token_hash   TEXT NOT NULL UNIQUE,
          hint         TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          expires_at   TEXT,
          last_used_at TEXT,
          revoked_at   TEXT
        );
        CREATE INDEX access_tokens_user_id_idx ON access_tokens (user_id);
      `,
      postgres: `
        CREATE TABLE access_tokens (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name         TEXT NOT NULL,
          token_hash   TEXT NOT NULL UNIQUE,
          hint         TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL,
          expires_at   TIMESTAMPTZ,
          last_used_at TIMESTAMPTZ,
          revoked_at   TIMESTAMPTZ
        );
        CREATE INDEX access_tokens_user_id_idx ON access_tokens (user_id);
      `
    }
  },
  {
    // Ownership and sharing. Existing documents get an owner when a user exists (see adoptUnowned)
    // and start private, like new ones.
    id: '005_sharing',
    sql: {
      sqlite: `
        ALTER TABLE documents ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'everyone'));
        CREATE INDEX documents_owner_id_idx ON documents (owner_id);
        CREATE TABLE document_grants (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
          granted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          PRIMARY KEY (document_id, user_id)
        );
        CREATE INDEX document_grants_user_id_idx ON document_grants (user_id);
      `,
      postgres: `
        ALTER TABLE documents ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'everyone'));
        CREATE INDEX documents_owner_id_idx ON documents (owner_id);
        CREATE TABLE document_grants (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
          granted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at  TIMESTAMPTZ NOT NULL,
          updated_at  TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (document_id, user_id)
        );
        CREATE INDEX document_grants_user_id_idx ON document_grants (user_id);
      `
    }
  },
  {
    // Share links (people who open one join with its role; revoking it removes them again),
    // invitations by email for people who have not signed in yet, and a log of access changes.
    id: '006_links_invites_audit',
    sql: {
      sqlite: `
        CREATE TABLE share_links (
          id          TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          token_hash  TEXT NOT NULL UNIQUE,
          role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
          created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at  TEXT NOT NULL,
          expires_at  TEXT,
          revoked_at  TEXT
        );
        CREATE INDEX share_links_document_id_idx ON share_links (document_id);
        ALTER TABLE document_grants ADD COLUMN link_id TEXT REFERENCES share_links(id) ON DELETE SET NULL;
        CREATE TABLE pending_grants (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          email       TEXT NOT NULL,
          role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
          granted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at  TEXT NOT NULL,
          PRIMARY KEY (document_id, email)
        );
        CREATE INDEX pending_grants_email_idx ON pending_grants (email);
        CREATE TABLE audit_log (
          id          TEXT PRIMARY KEY,
          document_id TEXT,
          actor_id    TEXT,
          action      TEXT NOT NULL,
          details     TEXT NOT NULL,
          created_at  TEXT NOT NULL
        );
        CREATE INDEX audit_log_document_idx ON audit_log (document_id, created_at);
        CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO app_settings (key, value) SELECT 'first_user_id', id FROM users ORDER BY created_at, id LIMIT 1;
      `,
      postgres: `
        CREATE TABLE share_links (
          id          TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          token_hash  TEXT NOT NULL UNIQUE,
          role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
          created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at  TIMESTAMPTZ NOT NULL,
          expires_at  TIMESTAMPTZ,
          revoked_at  TIMESTAMPTZ
        );
        CREATE INDEX share_links_document_id_idx ON share_links (document_id);
        ALTER TABLE document_grants ADD COLUMN link_id TEXT REFERENCES share_links(id) ON DELETE SET NULL;
        CREATE TABLE pending_grants (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          email       TEXT NOT NULL,
          role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
          granted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at  TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (document_id, email)
        );
        CREATE INDEX pending_grants_email_idx ON pending_grants (email);
        CREATE TABLE audit_log (
          id          TEXT PRIMARY KEY,
          document_id TEXT,
          actor_id    TEXT,
          action      TEXT NOT NULL,
          details     TEXT NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX audit_log_document_idx ON audit_log (document_id, created_at);
        CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO app_settings (key, value) SELECT 'first_user_id', id FROM users ORDER BY created_at, id LIMIT 1;
      `
    }
  },
  {
    // Users' own AI provider keys, one per user, provider and browser ("keyring"). Only ciphertext:
    // decrypting needs the server secret and the secret in that browser's keyring cookie.
    id: '007_llm_keys',
    sql: {
      sqlite: `
        CREATE TABLE user_llm_keys (
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider_id  TEXT NOT NULL,
          keyring_id   TEXT NOT NULL,
          salt         TEXT NOT NULL,
          iv           TEXT NOT NULL,
          ciphertext   TEXT NOT NULL,
          hint         TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          last_used_at TEXT,
          PRIMARY KEY (user_id, provider_id, keyring_id)
        );
        CREATE INDEX user_llm_keys_keyring_idx ON user_llm_keys (keyring_id);
      `,
      postgres: `
        CREATE TABLE user_llm_keys (
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider_id  TEXT NOT NULL,
          keyring_id   TEXT NOT NULL,
          salt         TEXT NOT NULL,
          iv           TEXT NOT NULL,
          ciphertext   TEXT NOT NULL,
          hint         TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL,
          last_used_at TIMESTAMPTZ,
          PRIMARY KEY (user_id, provider_id, keyring_id)
        );
        CREATE INDEX user_llm_keys_keyring_idx ON user_llm_keys (keyring_id);
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
