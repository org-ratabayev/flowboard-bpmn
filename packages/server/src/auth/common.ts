// Session handling shared by the sign-in methods that use the app's own session cookie.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from '../config.ts';
import { send } from '../http.ts';
import type { AuthStore, Identity } from './authStore.ts';
import { appendSetCookie, isSecure, parseCookies, serializeCookie } from './requestChecks.ts';

export const SESSION_COOKIE = 'flowboard_session';

export type SessionHelpers = ReturnType<typeof sessionHelpers>;

/** A same-site path to go back to after signing in; anything else becomes "/". */
export function safeReturnTo(value: string | null | undefined): string {
  const target = value || '/';
  return target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : '/';
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** A minimal page for sign-in outcomes that happen outside the browser app (errors, signed out). */
export function messagePage(res: ServerResponse, status: number, title: string, message: string, link?: { href: string; text: string }): void {
  const linkHtml = link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>` : '';
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#222}h1{font-size:22px}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${linkHtml}</body></html>`);
}

export function sessionHelpers(config: Config, store: AuthStore) {
  const secure = (req: IncomingMessage) => isSecure(req, config.publicOrigin);
  const days = config.auth.sessionDays;

  return {
    secure,

    async identify(req: IncomingMessage): Promise<Identity | null> {
      const token = parseCookies(req).get(SESSION_COOKIE);
      return token ? store.userForSession(token) : null;
    },

    /** Starts a session for the user; returns the Set-Cookie value. */
    async start(req: IncomingMessage, userId: string): Promise<string> {
      const { token } = await store.createSession(userId, days);
      return serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: days * 86400, secure: secure(req) });
    },

    /** Ends the session and tells the browser where to go next. */
    async logout(req: IncomingMessage, res: ServerResponse, redirect: string): Promise<void> {
      const token = parseCookies(req).get(SESSION_COOKIE);
      if (token) await store.deleteSession(token);
      appendSetCookie(res, serializeCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0, secure: secure(req) }));
      send(res, 200, { redirect });
    }
  };
}
