// "Access to document X changed": tells the live connections of this server instance at once
// and, with Postgres, the other instances through LISTEN/NOTIFY.

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import pg from 'pg';
import type { Db } from './storage/db.ts';

const CHANNEL = 'flowboard_access';
const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];

export interface AccessEvents {
  publish(documentId: string): Promise<void>;
  subscribe(listener: (documentId: string) => void): () => void;
  close(): Promise<void>;
}

function localEmitter() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    emit: (documentId: string) => emitter.emit('access', documentId),
    subscribe(listener: (documentId: string) => void) {
      emitter.on('access', listener);
      return () => { emitter.off('access', listener); };
    }
  };
}

/** Single instance (SQLite): events stay in this process. */
export function createLocalEvents(): AccessEvents {
  const local = localEmitter();
  return {
    async publish(documentId) { local.emit(documentId); },
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
): AccessEvents {
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
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const { i, d } = JSON.parse(msg.payload);
        if (i !== instance && typeof d === 'string') local.emit(d);
      } catch { /* not ours */ }
    });
    next.on('error', retry);
    next.on('end', retry);
    try {
      await next.connect();
      await next.query(`LISTEN ${CHANNEL}`);
      attempt = 0;
    } catch (err) {
      console.error('Postgres LISTEN failed, retrying:', (err as Error).message);
      retry();
    }
  }

  if (options.listen) connect();

  return {
    async publish(documentId) {
      local.emit(documentId);
      try {
        await db.read((q) => q.get('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ i: instance, d: documentId })]));
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
