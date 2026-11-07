// Who is making a request. Three ways to sign in:
//   dev              a name is enough, no password (trusted networks only); a session cookie follows
//   trusted-headers  an authenticating reverse proxy sets identity headers on every request
//   oidc             an OpenID Connect provider (see oidc.ts); a session cookie follows

import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Config } from '../config.ts';
import { readJson, send, serveStatic } from '../http.ts';
import type { AuthStore, Identity } from './authStore.ts';
import { sessionHelpers } from './common.ts';
import { createOidcAuth } from './oidc.ts';
import { addressMatcher, timingSafeEqual } from './requestChecks.ts';

export type { Identity } from './authStore.ts';
export { SESSION_COOKIE } from './common.ts';

const IDENTITY_CACHE_MS = 5 * 60 * 1000;

export interface Auth {
  kind: Config['auth']['kind'];
  /** Whether signing out is possible in the app (not with trusted-headers, where the proxy decides). */
  canLogout: boolean;
  identify(req: IncomingMessage): Promise<Identity | null>;
  /** The user's own access token, when the sign-in passes one on (for AI providers using the user's identity). Per request; never stored. */
  upstreamToken(req: IncomingMessage): string | null;
  /** Handles /auth/… routes; returns false for paths it does not know. */
  handle(req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean>;
}

/** Display name: no control characters or angle brackets, single spaces, at most 40 characters. */
export function cleanDisplayName(name: unknown): string {
  return String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function createAuth(config: Config, store: AuthStore): Auth {
  const session = sessionHelpers(config, store);
  if (config.auth.kind === 'oidc') return createOidcAuth(config, store, session);
  if (config.auth.kind === 'trusted-headers') return createTrustedHeadersAuth(config, store);

  return {
    kind: 'dev',
    canLogout: true,
    identify: session.identify,
    upstreamToken: () => null,
    async handle(req, res, parts) {
      const route = `${req.method} /${parts.join('/')}`;
      if (route === 'GET /auth/login') {
        await serveStatic(res, path.join(config.publicDir, 'login.html'));
        return true;
      }
      if (route === 'POST /auth/dev/login') {
        const name = cleanDisplayName((await readJson(req, 4096)).name);
        if (!name) {
          send(res, 400, { error: 'Enter your name' });
          return true;
        }
        const user = await store.upsertUser({ provider: 'dev', subject: name.toLowerCase(), name, email: null });
        res.setHeader('Set-Cookie', await session.start(req, user.id));
        send(res, 200, { id: user.id, name: user.name });
        return true;
      }
      if (route === 'POST /auth/logout') {
        await session.logout(req, res, '/auth/login');
        return true;
      }
      return false;
    }
  };
}

function createTrustedHeadersAuth(config: Config, store: AuthStore): Auth {
  const th = config.auth.trustedHeaders;
  const fromTrustedAddress = th.trustedProxies.length ? addressMatcher(th.trustedProxies) : null;
  const cache = new Map<string, { identity: Identity; until: number }>();

  function fromProxy(req: IncomingMessage): boolean {
    if (th.proxySecret) {
      const given = req.headers[th.proxySecretHeader];
      if (typeof given !== 'string' || !timingSafeEqual(given, th.proxySecret)) return false;
    }
    if (fromTrustedAddress && !fromTrustedAddress(req.socket.remoteAddress)) return false;
    return true;
  }

  const header = (req: IncomingMessage, name: string | undefined) => {
    const value = name ? req.headers[name] : undefined;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  return {
    kind: 'trusted-headers',
    canLogout: false,
    upstreamToken(req) {
      return th.tokenHeader && fromProxy(req) ? header(req, th.tokenHeader) : null;
    },
    async identify(req) {
      if (!fromProxy(req)) return null;
      const subject = header(req, th.subjectHeader);
      if (!subject) return null;
      const name = cleanDisplayName(header(req, th.nameHeader) ?? subject) || subject;
      const email = header(req, th.emailHeader);
      const key = `${subject}\n${name}\n${email ?? ''}`;
      const cached = cache.get(key);
      if (cached && cached.until > Date.now()) return cached.identity;
      const identity = await store.upsertUser({ provider: 'trusted-headers', subject, name, email });
      if (cache.size > 1000) cache.clear();
      cache.set(key, { identity, until: Date.now() + IDENTITY_CACHE_MS });
      return identity;
    },
    async handle(req, res, parts) {
      if (req.method === 'GET' && parts.join('/') === 'auth/login') {
        send(res, 401, 'Sign-in is handled by the proxy in front of this app. Reload the page after signing in there.');
        return true;
      }
      return false;
    }
  };
}
