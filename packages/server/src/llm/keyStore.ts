// Users' own AI provider keys ("bring your own key").
//
// A key is encrypted with AES-256-GCM under a key derived (HKDF-SHA256) from two secrets that
// are never stored together:
//   - the server secret (APP_SECRET), shared by all server instances;
//   - a random secret in an HttpOnly cookie of the user's browser (the "keyring").
// The database holds only ciphertext, so the database alone, the database plus the server secret,
// or the database plus the cookie cannot decrypt a key. The additional data binds each ciphertext to
// its user, provider and keyring, so rows cannot be moved to another account or provider.
// Each browser has its own keyring: a key entered in one browser is not usable from another.

import crypto from 'node:crypto';
import { toIso, type Db } from '../storage/db.ts';

export const KEYRING_COOKIE = 'flowboard_keyring';
const KEYRING_RE = /^([0-9a-f]{32})\.([\w-]{43})$/;
const INFO = 'flowboard/llm-key/v1';

export interface Keyring {
  id: string;
  secret: Buffer;
}

export interface StoredKeyInfo {
  providerId: string;
  /** The start and end of the key, to recognize it. */
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** A new keyring for a browser; `cookieValue` goes into its keyring cookie. */
export function newKeyring(): Keyring & { cookieValue: string } {
  const id = crypto.randomBytes(16).toString('hex');
  const secret = crypto.randomBytes(32);
  return { id, secret, cookieValue: `${id}.${secret.toString('base64url')}` };
}

export function parseKeyring(cookieValue: string | undefined): Keyring | null {
  const m = cookieValue ? KEYRING_RE.exec(cookieValue) : null;
  return m ? { id: m[1], secret: Buffer.from(m[2], 'base64url') } : null;
}

/** "sk-ant-…ab12": enough to recognize a key, never enough to use it. */
export function keyHint(key: string): string {
  const prefix = key.match(/^[a-z]+-(?:[a-z]+-)?/i)?.[0] ?? '';
  return `${prefix}…${key.slice(-4)}`;
}

export type KeyStore = ReturnType<typeof createKeyStore>;

export function createKeyStore(db: Db, appSecret: string) {
  // the server's half of every key, derived once from APP_SECRET
  const serverPart = Buffer.from(crypto.hkdfSync('sha256', appSecret, 'flowboard', 'llm-keys/server-part', 32));

  const keyFor = (keyring: Keyring, salt: Buffer) =>
    Buffer.from(crypto.hkdfSync('sha256', Buffer.concat([serverPart, keyring.secret]), salt, INFO, 32));
  const aad = (userId: string, providerId: string, keyringId: string) => Buffer.from(`${userId}\n${providerId}\n${keyringId}`);

  return {
    async save(userId: string, providerId: string, keyring: Keyring, apiKey: string): Promise<StoredKeyInfo> {
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(keyring, salt), iv);
      cipher.setAAD(aad(userId, providerId, keyring.id));
      const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      const info = { providerId, hint: keyHint(apiKey), createdAt: new Date().toISOString(), lastUsedAt: null };
      await db.transaction(async (q) => {
        await q.run('DELETE FROM user_llm_keys WHERE user_id = $1 AND provider_id = $2 AND keyring_id = $3', [userId, providerId, keyring.id]);
        await q.run(
          `INSERT INTO user_llm_keys (user_id, provider_id, keyring_id, salt, iv, ciphertext, hint, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, providerId, keyring.id, salt.toString('base64'), iv.toString('base64'), ciphertext.toString('base64'), info.hint, info.createdAt]
        );
      });
      return info;
    },

    /** The decrypted key, or null when this browser has none (or it cannot be decrypted). Records the use. */
    async use(userId: string, providerId: string, keyring: Keyring): Promise<string | null> {
      const row = await db.read((q) => q.get<{ salt: string; iv: string; ciphertext: string }>(
        'SELECT salt, iv, ciphertext FROM user_llm_keys WHERE user_id = $1 AND provider_id = $2 AND keyring_id = $3',
        [userId, providerId, keyring.id]
      ));
      if (!row) return null;
      try {
        const data = Buffer.from(row.ciphertext, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(keyring, Buffer.from(row.salt, 'base64')), Buffer.from(row.iv, 'base64'));
        decipher.setAAD(aad(userId, providerId, keyring.id));
        decipher.setAuthTag(data.subarray(data.length - 16));
        const key = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8');
        await db.transaction((q) => q.run(
          'UPDATE user_llm_keys SET last_used_at = $4 WHERE user_id = $1 AND provider_id = $2 AND keyring_id = $3',
          [userId, providerId, keyring.id, new Date().toISOString()]
        ));
        return key;
      } catch {
        return null; // wrong cookie secret or server secret, or tampered data
      }
    },

    /** The keys this browser holds for the user (never their values). */
    list(userId: string, keyringId: string | null): Promise<StoredKeyInfo[]> {
      if (!keyringId) return Promise.resolve([]);
      return db.read(async (q) =>
        (await q.all<{ provider_id: string; hint: string; created_at: unknown; last_used_at: unknown }>(
          'SELECT provider_id, hint, created_at, last_used_at FROM user_llm_keys WHERE user_id = $1 AND keyring_id = $2 ORDER BY provider_id',
          [userId, keyringId]
        )).map((r) => ({ providerId: r.provider_id, hint: r.hint, createdAt: toIso(r.created_at)!, lastUsedAt: toIso(r.last_used_at) }))
      );
    },

    remove(userId: string, providerId: string, keyringId: string): Promise<boolean> {
      return db.transaction(async (q) =>
        (await q.run('DELETE FROM user_llm_keys WHERE user_id = $1 AND provider_id = $2 AND keyring_id = $3', [userId, providerId, keyringId])).changes > 0
      );
    },

    /** Forgets every key of a browser (on sign-out its cookie is cleared too, so they could not be used anyway). */
    removeKeyring(keyringId: string): Promise<number> {
      return db.transaction(async (q) => (await q.run('DELETE FROM user_llm_keys WHERE keyring_id = $1', [keyringId])).changes);
    },

    /** Keys not used (or created) for `days`: their browser is most likely gone. */
    removeUnused(days: number): Promise<number> {
      const before = new Date(Date.now() - days * 864e5).toISOString();
      return db.transaction(async (q) => (await q.run(
        'DELETE FROM user_llm_keys WHERE coalesce(last_used_at, created_at) < $1', [before]
      )).changes);
    }
  };
}
