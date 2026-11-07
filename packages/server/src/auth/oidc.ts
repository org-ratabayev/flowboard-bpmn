// Sign-in with an OpenID Connect provider: authorization code flow with PKCE, state and nonce.
// The provider's metadata is discovered on the first sign-in (and again after a failure), so the
// server starts even while the provider is unreachable.

import type { IncomingMessage, ServerResponse } from 'node:http';
import * as client from 'openid-client';
import type { Config } from '../config.ts';
import type { AuthStore } from './authStore.ts';
import { messagePage, safeReturnTo, type SessionHelpers } from './common.ts';
import type { Auth } from './index.ts';
import { cleanDisplayName } from './index.ts';
import { parseCookies, serializeCookie } from './requestChecks.ts';

const STATE_COOKIE = 'flowboard_oidc_state';
const FLOW_MINUTES = 10;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createOidcAuth(config: Config, store: AuthStore, session: SessionHelpers): Auth {
  const oidc = config.auth.oidc;
  const issuer = new URL(oidc.issuer!);
  const redirectUri = `${config.publicOrigin}/auth/callback`;
  const allowedDomains = oidc.allowedEmailDomains.map((d) => d.toLowerCase());

  let discovered: Promise<client.Configuration> | null = null;
  function provider(): Promise<client.Configuration> {
    discovered ??= client
      .discovery(
        issuer,
        oidc.clientId!,
        undefined,
        oidc.clientSecret ? client.ClientSecretPost(oidc.clientSecret) : client.None(),
        // plain http only for a provider on this machine (development and tests)
        LOOPBACK.has(issuer.hostname) ? { execute: [client.allowInsecureRequests] } : undefined
      )
      .catch((err) => {
        discovered = null;
        throw err;
      });
    return discovered;
  }

  const stateCookie = (req: IncomingMessage, value: string, maxAgeSeconds: number) =>
    serializeCookie(STATE_COOKIE, value, { maxAgeSeconds, secure: session.secure(req) });

  async function login(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    let cfg: client.Configuration;
    try {
      cfg = await provider();
    } catch (err) {
      console.error('OIDC discovery failed:', (err as Error).message);
      return messagePage(res, 502, 'Sign-in unavailable', 'The sign-in provider cannot be reached right now. Try again in a moment.', { href: url.pathname + url.search, text: 'Try again' });
    }
    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    await store.startFlow({ state, nonce, codeVerifier, returnTo: safeReturnTo(url.searchParams.get('returnTo')) }, FLOW_MINUTES);
    const target = client.buildAuthorizationUrl(cfg, {
      redirect_uri: redirectUri,
      scope: oidc.scopes,
      state,
      nonce,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256'
    });
    // ties the callback to this browser: a callback link from someone else's sign-in is refused
    res.setHeader('Set-Cookie', stateCookie(req, state, FLOW_MINUTES * 60));
    res.writeHead(302, { Location: target.href, 'Cache-Control': 'no-store' });
    res.end();
  }

  async function callback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const retry = { href: '/auth/login', text: 'Sign in again' };
    const state = url.searchParams.get('state');
    const expected = parseCookies(req).get(STATE_COOKIE);
    const flow = state && expected === state ? await store.takeFlow(state) : null;
    if (!flow) {
      return messagePage(res, 400, 'Sign-in expired', 'This sign-in link has expired, was already used, or was started in another browser.', retry);
    }
    if (url.searchParams.get('error')) {
      return messagePage(res, 403, 'Sign-in refused', `The sign-in provider refused: ${url.searchParams.get('error_description') || url.searchParams.get('error')}`, retry);
    }

    let claims: client.IDToken;
    try {
      const tokens = await client.authorizationCodeGrant(await provider(), new URL(req.url || '/', config.publicOrigin), {
        pkceCodeVerifier: flow.codeVerifier,
        expectedState: state!,
        expectedNonce: flow.nonce,
        idTokenExpected: true
      });
      claims = tokens.claims()!;
    } catch (err) {
      console.error('OIDC sign-in failed:', (err as Error).message);
      return messagePage(res, 502, 'Sign-in failed', 'The answer from the sign-in provider could not be verified.', retry);
    }

    // An email the provider marks as unverified is not kept: invitations are redeemed by email.
    const email = typeof claims.email === 'string' && claims.email_verified !== false ? claims.email.toLowerCase() : null;
    if (allowedDomains.length) {
      const domain = email?.split('@')[1];
      if (!email || claims.email_verified === false || !domain || !allowedDomains.includes(domain)) {
        return messagePage(res, 403, 'Not allowed', 'This account is not allowed to use this app.', retry);
      }
    }

    const name = cleanDisplayName(claims.name ?? claims.preferred_username ?? email ?? claims.sub) || claims.sub;
    const user = await store.upsertUser({ provider: 'oidc', subject: claims.sub, name, email });
    res.setHeader('Set-Cookie', [await session.start(req, user.id), stateCookie(req, '', 0)]);
    res.writeHead(302, { Location: flow.returnTo, 'Cache-Control': 'no-store' });
    res.end();
  }

  return {
    kind: 'oidc',
    canLogout: true,
    identify: session.identify,
    async handle(req, res, parts) {
      const url = new URL(req.url || '/', 'http://localhost');
      const route = `${req.method} /${parts.join('/')}`;
      if (route === 'GET /auth/login') return login(req, res, url).then(() => true);
      if (route === 'GET /auth/callback') return callback(req, res, url).then(() => true);
      if (route === 'POST /auth/logout') return session.logout(req, res, '/auth/signed-out').then(() => true);
      if (route === 'GET /auth/signed-out') {
        messagePage(res, 200, 'Signed out', 'You are signed out of this app. Your account at the sign-in provider stays signed in.', { href: '/auth/login', text: 'Sign in again' });
        return true;
      }
      return false;
    }
  };
}
