// Users and browser sessions. Session tokens are random; only their SHA-256 hash is stored.

import crypto from 'node:crypto';
import { toIso, type Db } from '../storage/db.ts';

export interface Identity {
  /** users.id */
  id: string;
  provider: string;
  /** The provider's stable id for the user. */
  subject: string;
  name: string;
  email: string | null;
}

export type ExternalIdentity = Omit<Identity, 'id'>;

export interface AuthFlow {
  state: string;
  codeVerifier: string;
  nonce: string;
  /** Same-site path to return to after signing in. */
  returnTo: string;
}

export type AuthStore = ReturnType<typeof createAuthStore>;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

interface UserRow {
  id: string;
  provider: string;
  subject: string;
  name: string;
  email: string | null;
}

const toIdentity = (r: UserRow): Identity => ({ id: r.id, provider: r.provider, subject: r.subject, name: r.name, email: r.email ?? null });

export function createAuthStore(db: Db) {
  return {
    /** Finds or creates the user for a provider identity and refreshes name and email. */
    upsertUser(ext: ExternalIdentity): Promise<Identity> {
      return db.transaction(async (q) => {
        const now = new Date().toISOString();
        const row = await q.get<UserRow>('SELECT id, provider, subject, name, email FROM users WHERE provider = $1 AND subject = $2', [ext.provider, ext.subject]);
        if (row) {
          await q.run('UPDATE users SET name = $2, email = $3, last_seen_at = $4 WHERE id = $1', [row.id, ext.name, ext.email ?? null, now]);
          return toIdentity({ ...row, name: ext.name, email: ext.email ?? null });
        }
        const id = crypto.randomUUID();
        await q.run(
          'INSERT INTO users (id, provider, subject, name, email, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5, $6, $6)',
          [id, ext.provider, ext.subject, ext.name, ext.email ?? null, now]
        );
        return { id, ...ext, email: ext.email ?? null };
      });
    },

    /** Starts a session; returns the token to put in the cookie. */
    async createSession(userId: string, days: number): Promise<{ token: string; expiresAt: string }> {
      const token = crypto.randomBytes(32).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + days * 864e5).toISOString();
      await db.transaction((q) =>
        q.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [hash(token), userId, now.toISOString(), expiresAt])
      );
      return { token, expiresAt };
    },

    /** The user of a valid, unexpired session, or null. */
    async userForSession(token: string): Promise<Identity | null> {
      const row = await db.read((q) =>
        q.get<UserRow & { expires_at: unknown }>(
          `SELECT u.id, u.provider, u.subject, u.name, u.email, s.expires_at
           FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
          [hash(token)]
        )
      );
      if (!row) return null;
      if (toIso(row.expires_at)! <= new Date().toISOString()) {
        await this.deleteSession(token);
        return null;
      }
      return toIdentity(row);
    },

    async deleteSession(token: string): Promise<void> {
      await db.transaction((q) => q.run('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]));
    },

    async deleteExpiredSessions(): Promise<number> {
      return db.transaction(async (q) => {
        const now = new Date().toISOString();
        await q.run('DELETE FROM auth_flows WHERE expires_at <= $1', [now]);
        return (await q.run('DELETE FROM sessions WHERE expires_at <= $1', [now])).changes;
      });
    },

    /** Remembers a sign-in started with an external provider until its callback (keyed by a hash of `state`). */
    async startFlow(flow: AuthFlow, ttlMinutes = 10): Promise<void> {
      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
      await db.transaction((q) =>
        q.run('INSERT INTO auth_flows (state_hash, code_verifier, nonce, return_to, expires_at) VALUES ($1, $2, $3, $4, $5)',
          [hash(flow.state), flow.codeVerifier, flow.nonce, flow.returnTo, expiresAt])
      );
    },

    /** Returns and removes the flow for `state`; null when unknown, already used or expired. */
    takeFlow(state: string): Promise<AuthFlow | null> {
      return db.transaction(async (q) => {
        const row = await q.get<{ code_verifier: string; nonce: string; return_to: string; expires_at: unknown }>(
          'SELECT code_verifier, nonce, return_to, expires_at FROM auth_flows WHERE state_hash = $1', [hash(state)]
        );
        if (!row) return null;
        await q.run('DELETE FROM auth_flows WHERE state_hash = $1', [hash(state)]);
        if (toIso(row.expires_at)! <= new Date().toISOString()) return null;
        return { state, codeVerifier: row.code_verifier, nonce: row.nonce, returnTo: row.return_to };
      });
    }
  };
}
