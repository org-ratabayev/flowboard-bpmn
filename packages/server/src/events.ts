// Small "something changed, look again" signals between server instances. Each event carries only
// an id; listeners re-read the database for the details.
//
//   access  access to document <id> changed (or it was deleted): live connections re-check their role
//   chat    conversation <id> changed: a tool result arrived, or a turn was cancelled or deleted
//
// Events reach the listeners of this instance at once and, with Postgres, the other instances
// through LISTEN/NOTIFY (one channel per topic).

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import pg from 'pg';
import type { Db } from './storage/db.ts';

export type Topic = 'access' | 'chat';

const CHANNELS: Record<Topic, string> = { access: 'flowboard_access', chat: 'flowboard_chat' };
const TOPIC_OF = new Map(Object.entries(CHANNELS).map(([topic, channel]) => [channel, topic as Topic]));
const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];

export interface EventBus {
  publish(topic: Topic, id: string): Promise<void>;
  subscribe(topic: Topic, listener: (id: string) => void): () => void;
  close(): Promise<void>;
}

function localEmitter() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    emit: (topic: Topic, id: string) => emitter.emit(topic, id),
    subscribe(topic: Topic, listener: (id: string) => void) {
      emitter.on(topic, listener);
      return () => { emitter.off(topic, listener); };
    }
  };
}

/** Single instance (SQLite): events stay in this process. */
export function createLocalEvents(): EventBus {
  const local = localEmitter();
  return {
    async publish(topic, id) { local.emit(topic, id); },
    subscribe: local.subscribe,
    async close() {}
  };
}

export interface ListenerClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  on(event: 'notification', listener: (msg: { channel: string; payload?: string }) => void): unknown;
  on(event: 'error' | 'end', listener: (err?: Error) => void): unknown;
  end(): Promise<void>;
}

/**
 * Several instances on one Postgres database: publish notifies this instance directly and the
 * others through NOTIFY; a dedicated connection LISTENs (reconnecting after errors). Without
 * `listen`, only this instance is told (for single-session test databases).
 */
export function createPostgresEvents(
  db: Db,
  options: { connectionString: string; listen: boolean; createClient?: () => ListenerClient }
): EventBus {
  const local = localEmitter();
  const instance = crypto.randomUUID();
  let client: ListenerClient | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function connect(): Promise<void> {
    if (closed) return;
    const next: ListenerClient = options.createClient
      ? options.createClient()
      : (new pg.Client({ connectionString: options.connectionString }) as unknown as ListenerClient);
    const retry = () => {
      if (closed || client !== next) return;
      client = null;
      next.end().catch(() => {});
      retryTimer = setTimeout(connect, RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]);
    };
    client = next;
    next.on('notification', (msg) => {
      const topic = TOPIC_OF.get(msg.channel);
      if (!topic || !msg.payload) return;
      try {
        const { i, d } = JSON.parse(msg.payload);
        if (i !== instance && typeof d === 'string') local.emit(topic, d);
      } catch { /* not ours */ }
    });
    next.on('error', retry);
    next.on('end', retry);
    try {
      await next.connect();
      for (const channel of Object.values(CHANNELS)) await next.query(`LISTEN ${channel}`);
      attempt = 0;
    } catch (err) {
      console.error('Postgres LISTEN failed, retrying:', (err as Error).message);
      retry();
    }
  }

  if (options.listen) connect();

  return {
    async publish(topic, id) {
      local.emit(topic, id);
      try {
        await db.read((q) => q.get('SELECT pg_notify($1, $2)', [CHANNELS[topic], JSON.stringify({ i: instance, d: id })]));
      } catch (err) {
        console.error('Postgres NOTIFY failed:', (err as Error).message);
      }
    },
    subscribe: local.subscribe,
    async close() {
      closed = true;
      clearTimeout(retryTimer);
      const current = client;
      client = null;
      await current?.end().catch(() => {});
    }
  };
}
