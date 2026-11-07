// Personal access tokens: `Authorization: Bearer fb_pat_…` for API and MCP clients.
// The token is shown once when created; the database keeps its SHA-256 hash and a short hint.

import crypto from 'node:crypto';
import { toIso, type Db } from '../storage/db.ts';
import type { Identity } from './authStore.ts';

export const TOKEN_PREFIX = 'fb_pat_';
export const MAX_TOKENS_PER_USER = 50;
const TOKEN_RE = /^fb_pat_[\w-]{43}$/;
/** last_used_at is written at most this often per token. */
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface AccessToken {
  id: string;
  name: string;
  /** The first characters, to recognize a token in the list. */
  hint: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface TokenRow {
  id: string;
  name: string;
  hint: string;
  created_at: unknown;
  expires_at: unknown;
  last_used_at: unknown;
}

const toAccessToken = (r: TokenRow): AccessToken => ({
  id: r.id,
  name: r.name,
  hint: r.hint,
  createdAt: toIso(r.created_at)!,
  expiresAt: toIso(r.expires_at),
  lastUsedAt: toIso(r.last_used_at)
});

export type TokenStore = ReturnType<typeof createTokenStore>;

export function createTokenStore(db: Db) {
  return {
    /** Creates a token; the returned `token` is the only time its value is available. */
    create(userId: string, name: string, expiresInDays: number | null): Promise<AccessToken & { token: string }> {
      return db.transaction(async (q) => {
        const count = Number((await q.get<{ n: unknown }>(
          'SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = $1 AND revoked_at IS NULL', [userId]
        ))!.n);
        if (count >= MAX_TOKENS_PER_USER) throw new Error(`At most ${MAX_TOKENS_PER_USER} tokens per user; revoke unused ones first`);
        const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
        const row = {
          id: crypto.randomUUID(),
          name,
          hint: `${token.slice(0, TOKEN_PREFIX.length + 4)}…`,
          created_at: new Date().toISOString(),
          expires_at: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 864e5).toISOString(),
          last_used_at: null
        };
        await q.run(
          'INSERT INTO access_tokens (id, user_id, name, token_hash, hint, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [row.id, userId, name, hash(token), row.hint, row.created_at, row.expires_at]
        );
        return { ...toAccessToken(row), token };
      });
    },

    /** The user's active tokens, newest first. */
    list(userId: string): Promise<AccessToken[]> {
      return db.read(async (q) =>
        (await q.all<TokenRow>(
          'SELECT id, name, hint, created_at, expires_at, last_used_at FROM access_tokens WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC, id',
          [userId]
        )).map(toAccessToken)
      );
    },

    /** Revokes one of the user's tokens; false when there is no such active token. */
    revoke(userId: string, id: string): Promise<boolean> {
      return db.transaction(async (q) =>
        (await q.run('UPDATE access_tokens SET revoked_at = $3 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
          [id, userId, new Date().toISOString()])).changes > 0
      );
    },

    /** The owner of a valid (well-formed, unrevoked, unexpired) token, or null. */
    async userForToken(token: string): Promise<Identity | null> {
      if (!TOKEN_RE.test(token)) return null;
      const row = await db.read((q) =>
        q.get<{ token_id: string; expires_at: unknown; last_used_at: unknown; id: string; provider: string; subject: string; name: string; email: string | null }>(
          `SELECT t.id AS token_id, t.expires_at, t.last_used_at, u.id, u.provider, u.subject, u.name, u.email
           FROM access_tokens t JOIN users u ON u.id = t.user_id
           WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
          [hash(token)]
        )
      );
      if (!row) return null;
      const now = new Date();
      if (row.expires_at && toIso(row.expires_at)! <= now.toISOString()) return null;
      const lastUsed = toIso(row.last_used_at);
      if (!lastUsed || Date.parse(lastUsed) < now.getTime() - LAST_USED_RESOLUTION_MS) {
        await db.transaction((q) => q.run('UPDATE access_tokens SET last_used_at = $2 WHERE id = $1', [row.token_id, now.toISOString()]));
      }
      return { id: row.id, provider: row.provider, subject: row.subject, name: row.name, email: row.email ?? null };
    }
  };
}
