import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../storage/db.ts';
import { backends } from '../storage/testBackends.ts';
import { createAuthStore, type AuthStore } from './authStore.ts';
import { cleanDisplayName } from './index.ts';
import { addressMatcher, isSameOrigin, parseCookies } from './requestChecks.ts';

const req = (headers: Record<string, string>) => ({ headers, socket: {} }) as unknown as IncomingMessage;

describe('request checks', () => {
  it('matches addresses and CIDR ranges, including IPv4-mapped IPv6', () => {
    const match = addressMatcher(['10.0.0.0/8', '192.168.1.5', 'fd00::/8']);
    expect(match('10.1.2.3')).toBe(true);
    expect(match('::ffff:10.1.2.3')).toBe(true);
    expect(match('192.168.1.5')).toBe(true);
    expect(match('192.168.1.6')).toBe(false);
    expect(match('fd12::1')).toBe(true);
    expect(match('::1')).toBe(false);
    expect(match(undefined)).toBe(false);
    expect(() => addressMatcher(['not-an-ip'])).toThrow('not an IP address');
  });

  it('accepts only the app itself as Origin', () => {
    expect(isSameOrigin(req({ origin: 'http://localhost:3000', host: 'localhost:3000' }), undefined)).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://localhost:3000', host: 'localhost:3000' }), undefined)).toBe(true); // TLS proxy in front
    expect(isSameOrigin(req({ origin: 'http://evil.example', host: 'localhost:3000' }), undefined)).toBe(false);
    expect(isSameOrigin(req({ host: 'localhost:3000' }), undefined)).toBe(false);
    expect(isSameOrigin(req({ origin: 'null', host: 'localhost:3000' }), undefined)).toBe(false);
    expect(isSameOrigin(req({ origin: 'https://bpmn.example.com', host: 'internal:3000' }), 'https://bpmn.example.com')).toBe(true);
    expect(isSameOrigin(req({ origin: 'http://internal:3000', host: 'internal:3000' }), 'https://bpmn.example.com')).toBe(false);
  });

  it('parses cookies, keeping the first of duplicate names', () => {
    const cookies = parseCookies(req({ cookie: 'a=1; b=x%20y; a=2; bad; c=%E0%A4%A' }));
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('b')).toBe('x y');
    expect(cookies.has('c')).toBe(false);
  });

  it('cleans display names', () => {
    expect(cleanDisplayName('  Ann\n  <Lee>  ')).toBe('Ann Lee');
    expect(cleanDisplayName('x'.repeat(50))).toHaveLength(40);
    expect(cleanDisplayName(undefined)).toBe('');
  });
});

describe.each(backends)('$name users and sessions', (backend) => {
  let auth: AuthStore;
  let db: Db;
  let cleanup: () => Promise<void>;
  beforeEach(async () => {
    const opened = await backend.open();
    db = opened.store.db;
    auth = createAuthStore(db);
    cleanup = opened.cleanup;
  });
  afterEach(() => cleanup());

  it('creates a user once per provider and subject and keeps name and email current', async () => {
    const first = await auth.upsertUser({ provider: 'dev', subject: 'ann', name: 'Ann', email: null });
    const again = await auth.upsertUser({ provider: 'dev', subject: 'ann', name: 'ANN', email: 'ann@example.com' });
    const other = await auth.upsertUser({ provider: 'trusted-headers', subject: 'ann', name: 'Ann', email: null });
    expect(again).toEqual({ ...first, name: 'ANN', email: 'ann@example.com' });
    expect(other.id).not.toBe(first.id);
  });

  it('finds the user of a session until it expires or is deleted', async () => {
    const user = await auth.upsertUser({ provider: 'dev', subject: 'bob', name: 'Bob', email: null });
    const { token } = await auth.createSession(user.id, 30);
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(await auth.userForSession(token)).toEqual(user);
    expect(await auth.userForSession(token + 'x')).toBeNull();

    await auth.deleteSession(token);
    expect(await auth.userForSession(token)).toBeNull();

    const expired = await auth.createSession(user.id, -1);
    expect(await auth.userForSession(expired.token)).toBeNull();
    const old = await auth.createSession(user.id, -1);
    expect(await auth.deleteExpiredSessions()).toBe(1);
    expect(await auth.userForSession(old.token)).toBeNull();
  });

  it('hands out a sign-in flow once, and not after it expired', async () => {
    const flow = { state: 'state-1', codeVerifier: 'verifier', nonce: 'nonce', returnTo: '/p/x' };
    await auth.startFlow(flow);
    expect(await auth.takeFlow('state-2')).toBeNull();
    expect(await auth.takeFlow('state-1')).toEqual(flow);
    expect(await auth.takeFlow('state-1')).toBeNull();

    await auth.startFlow({ ...flow, state: 'old' }, -1);
    expect(await auth.takeFlow('old')).toBeNull();
    const rows = await db.read((q) => q.all<{ state_hash: string }>('SELECT state_hash FROM auth_flows'));
    expect(rows).toEqual([]);
  });

  it('stores only a hash of the session token', async () => {
    const user = await auth.upsertUser({ provider: 'dev', subject: 'cy', name: 'Cy', email: null });
    const { token } = await auth.createSession(user.id, 1);
    const rows = await db.read((q) => q.all<{ token_hash: string }>('SELECT token_hash FROM sessions'));
    expect(rows).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex') }]);
  });
});
