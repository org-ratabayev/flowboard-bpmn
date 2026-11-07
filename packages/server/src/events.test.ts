import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalEvents, createPostgresEvents, type ListenerClient } from './events.ts';
import type { Db } from './storage/db.ts';

/** A stand-in for the LISTEN connection that tests can drive. */
function fakeClient() {
  const handlers: Record<string, Array<(arg?: any) => void>> = {};
  const client = {
    queries: [] as string[],
    ended: false,
    connect: vi.fn(async () => {}),
    query: vi.fn(async (sql: string) => { client.queries.push(sql); }),
    on(event: string, handler: (arg?: any) => void) { (handlers[event] ??= []).push(handler); return client; },
    end: vi.fn(async () => { client.ended = true; }),
    emit(event: string, arg?: unknown) { for (const h of handlers[event] ?? []) h(arg); }
  };
  return client;
}

/** A Db that records the NOTIFY queries. */
function fakeDb() {
  const notified: Array<[string, string]> = [];
  const db = {
    notified,
    read: async (fn: (q: any) => Promise<unknown>) => fn({ get: async (_sql: string, params: [string, string]) => { notified.push(params); } })
  };
  return db as unknown as Db & { notified: Array<[string, string]> };
}

afterEach(() => { vi.useRealTimers(); });

describe('access events', () => {
  it('stay in the process with SQLite', async () => {
    const events = createLocalEvents();
    const seen: string[] = [];
    const stop = events.subscribe((id) => seen.push(id));
    await events.publish('doc-1');
    stop();
    await events.publish('doc-2');
    expect(seen).toEqual(['doc-1']);
  });

  it('with Postgres, tell this instance directly and the others through NOTIFY', async () => {
    const db = fakeDb();
    const listener = fakeClient();
    const events = createPostgresEvents(db, { connectionString: 'postgres://x', listen: true, createClient: () => listener as unknown as ListenerClient });
    await vi.waitFor(() => expect(listener.queries).toEqual(['LISTEN flowboard_access']));
    const seen: string[] = [];
    events.subscribe((id) => seen.push(id));

    await events.publish('doc-1');
    expect(seen).toEqual(['doc-1']);
    const [channel, payload] = db.notified[0];
    expect(channel).toBe('flowboard_access');
    const { i: ownInstance, d } = JSON.parse(payload);
    expect(d).toBe('doc-1');

    // our own notification comes back through LISTEN: ignored, it was handled directly
    listener.emit('notification', { channel: 'flowboard_access', payload });
    // another instance's notification: handled
    listener.emit('notification', { channel: 'flowboard_access', payload: JSON.stringify({ i: 'other', d: 'doc-2' }) });
    // unrelated or malformed ones: ignored
    listener.emit('notification', { channel: 'something_else', payload: JSON.stringify({ i: 'other', d: 'doc-3' }) });
    listener.emit('notification', { channel: 'flowboard_access', payload: 'not json' });
    expect(seen).toEqual(['doc-1', 'doc-2']);
    expect(ownInstance).not.toBe('other');
    await events.close();
    expect(listener.ended).toBe(true);
  });

  it('reconnect the LISTEN connection after it fails, and stop when closed', async () => {
    vi.useFakeTimers();
    const connections: ReturnType<typeof fakeClient>[] = [];
    const events = createPostgresEvents(fakeDb(), {
      connectionString: 'postgres://x',
      listen: true,
      createClient: () => { const c = fakeClient(); connections.push(c); return c as unknown as ListenerClient; }
    });
    await vi.waitFor(() => expect(connections[0].queries).toHaveLength(1));
    connections[0].emit('error', new Error('connection lost'));
    expect(connections[0].ended).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(connections).toHaveLength(2);
    await vi.waitFor(() => expect(connections[1].queries).toEqual(['LISTEN flowboard_access']));

    await events.close();
    connections[1].emit('end');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connections).toHaveLength(2);
  });

  it('can run without a LISTEN connection', async () => {
    const create = vi.fn();
    const events = createPostgresEvents(fakeDb(), { connectionString: 'postgres://x', listen: false, createClient: create });
    const seen: string[] = [];
    events.subscribe((id) => seen.push(id));
    await events.publish('doc-1');
    expect(seen).toEqual(['doc-1']);
    expect(create).not.toHaveBeenCalled();
  });
});
