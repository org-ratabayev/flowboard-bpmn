// /api/llm…  The AI providers a user can use, and the user's own keys for them.
//   GET    providers          the catalog for this user: readiness, and for own keys a hint and last use
//   PUT    keys/:providerId   { key }  check the key with the provider, then store it for this browser
//   DELETE keys/:providerId   forget this browser's key for the provider

import type { IncomingMessage, ServerResponse } from 'node:http';
import { appendSetCookie, isSecure, parseCookies, serializeCookie } from '../auth/requestChecks.ts';
import { readJson, send } from '../http.ts';
import type { LlmCatalog, RequestContext } from './catalog.ts';
import { KEYRING_COOKIE, newKeyring, parseKeyring, type KeyStore } from './keyStore.ts';
import { LlmError } from './types.ts';

const KEYRING_DAYS = 365;
const MAX_KEY_LENGTH = 500;

export interface LlmContext {
  mode: 'personal' | 'managed';
  catalog: LlmCatalog;
  /** Null when no provider takes users' own keys. */
  keys: KeyStore | null;
  publicOrigin: string | undefined;
}

/** Replaces every occurrence of the secrets, so provider error messages can never echo a key back. */
export function redact(text: string, ...secrets: Array<string | null | undefined>): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 4) out = out.split(secret).join('[redacted]');
  return out;
}

export async function handleLlm(
  llm: LlmContext,
  request: RequestContext & { viaToken: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  rest: string[]
): Promise<void> {
  const keyring = parseKeyring(parseCookies(req).get(KEYRING_COOKIE));

  if (rest[0] === 'providers' && rest.length === 1 && req.method === 'GET') {
    const summaries = await llm.catalog.summaries(request);
    const stored = llm.keys && !request.viaToken ? await llm.keys.list(request.user.id, keyring?.id ?? null) : [];
    const byProvider = new Map(stored.map((k) => [k.providerId, k]));
    return send(res, 200, {
      mode: llm.mode,
      providers: summaries.map((p) => {
        if (p.credentials !== 'user-key') return p;
        const key = byProvider.get(p.id);
        return key
          ? { ...p, ready: true, reason: undefined, key: { hint: key.hint, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt } }
          : { ...p, key: null };
      })
    });
  }

  if (rest[0] === 'keys' && rest.length === 2) {
    // own keys live with a browser; scripts with an access token cannot read, add or remove them
    if (request.viaToken) return send(res, 403, { error: 'Manage your AI keys in the app (Settings), not with a token' });
    const entry = llm.catalog.get(rest[1]);
    if (!entry || entry.credentials.from !== 'user-key' || !llm.keys) return send(res, 404, { error: 'This provider does not take your own key' });

    if (req.method === 'PUT') {
      const { key } = await readJson(req, 4096);
      const apiKey = typeof key === 'string' ? key.trim() : '';
      if (!apiKey || apiKey.length > MAX_KEY_LENGTH || /\s/.test(apiKey)) return send(res, 400, { error: 'Paste the API key exactly as the provider shows it' });

      // check the key before keeping it, so a typo is noticed now and not in the middle of a chat
      try {
        await llm.catalog.client(entry.id)!.listModels({ apiKey, headers: entry.headers });
      } catch (err) {
        if (err instanceof LlmError && (err.status === 401 || err.status === 403)) {
          return send(res, 400, { error: `${entry.label} did not accept this key` });
        }
        return send(res, 502, { error: redact(`Could not reach ${entry.label} to check the key: ${(err as Error).message}`, apiKey) });
      }

      let ring = keyring;
      if (!ring) {
        const created = newKeyring();
        ring = created;
        appendSetCookie(res, serializeCookie(KEYRING_COOKIE, created.cookieValue, {
          maxAgeSeconds: KEYRING_DAYS * 86400, secure: isSecure(req, llm.publicOrigin), sameSite: 'Strict'
        }));
      }
      const saved = await llm.keys.save(request.user.id, entry.id, ring, apiKey);
      return send(res, 200, { providerId: entry.id, hint: saved.hint, createdAt: saved.createdAt, lastUsedAt: null });
    }

    if (req.method === 'DELETE') {
      if (!keyring || !(await llm.keys.remove(request.user.id, entry.id, keyring.id))) return send(res, 404, { error: 'No key saved in this browser' });
      return send(res, 204, '');
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  return send(res, 404, { error: 'Not found' });
}

/** On sign-out: forget the keys of this browser and its keyring cookie. */
export async function forgetKeyring(keys: KeyStore | null, req: IncomingMessage, res: ServerResponse, publicOrigin: string | undefined): Promise<void> {
  const keyring = parseKeyring(parseCookies(req).get(KEYRING_COOKIE));
  if (!keyring) return;
  if (keys) await keys.removeKeyring(keyring.id);
  appendSetCookie(res, serializeCookie(KEYRING_COOKIE, '', { maxAgeSeconds: 0, secure: isSecure(req, publicOrigin), sameSite: 'Strict' }));
}
