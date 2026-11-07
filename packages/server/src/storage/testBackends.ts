// Test helper: opens a fresh store on each backend (SQLite file, Postgres via in-process PGlite).

import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { migrate } from './migrations.ts';
import { openPostgres } from './postgresDb.ts';
import { openSqlite } from './sqliteDb.ts';
import { createSqlStore, type DocumentStore } from './sqlStore.ts';

export interface TestBackend {
  name: 'sqlite' | 'postgres';
  open(): Promise<{ store: DocumentStore; cleanup(): Promise<void> }>;
}

async function freePort(): Promise<number> {
  const srv = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const { port } = srv.address() as net.AddressInfo;
  await new Promise((r) => srv.close(r));
  return port;
}

export const backends: TestBackend[] = [
  {
    name: 'sqlite',
    async open() {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-test-'));
      const db = openSqlite(path.join(dir, 'test.sqlite'));
      await migrate(db);
      const store = createSqlStore(db);
      return { store, cleanup: async () => { await store.close(); await fs.rm(dir, { recursive: true, force: true }); } };
    }
  },
  {
    name: 'postgres',
    async open() {
      const pglite = await PGlite.create();
      const port = await freePort();
      const server = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1', maxConnections: 1 });
      await server.start();
      const db = openPostgres(`postgres://postgres@127.0.0.1:${port}/postgres`, 1);
      await migrate(db);
      const store = createSqlStore(db);
      return { store, cleanup: async () => { await store.close(); await server.stop(); await pglite.close(); } };
    }
  }
];
