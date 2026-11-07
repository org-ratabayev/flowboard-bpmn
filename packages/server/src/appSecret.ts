// The server secret (APP_SECRET): one half of the key that protects users' own AI keys.
// All server instances must share it. Without APP_SECRET, a single SQLite instance generates
// one into its data folder; with Postgres (possibly several instances) it must be configured.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';

export const APP_SECRET_FILE = 'app-secret';

export function resolveAppSecret(config: Config): { secret: string; source: 'env' | 'file' | 'generated' } {
  if (config.appSecret) return { secret: config.appSecret, source: 'env' };
  if (config.storage.kind === 'postgres') {
    throw new Error('APP_SECRET is required with Postgres storage when users can save their own AI keys: ' +
      'every server instance must use the same secret (at least 32 characters, e.g. `openssl rand -base64 48`)');
  }
  const file = path.join(config.dataDir, APP_SECRET_FILE);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return { secret: existing, source: 'file' };
  } catch { /* not there yet */ }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, secret + '\n', { mode: 0o600, flag: 'wx' });
  return { secret, source: 'generated' };
}
