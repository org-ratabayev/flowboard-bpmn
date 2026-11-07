import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, Queryable } from './db.ts';

// node:sqlite is synchronous, so every unit of work on a connection runs under one lock: an
// `await` inside a transaction must not let another request's queries slip into it.
//
// Within one process, all openings of the same file share one connection and lock. With two
// connections, one waiting for SQLite's file lock would block the event loop synchronously,
// so the other could never finish its transaction (a deadlock until busy_timeout).

const toSqlite = (sql: string) => sql.replace(/\$(\d+)/g, '?$1');

interface Shared {
  db: DatabaseSync;
  queue: Promise<unknown>;
  refs: number;
}

const open = new Map<string, Shared>();

export function openSqlite(file: string): Db {
  const key = file === ':memory:' ? Symbol('memory').toString() + Math.random() : path.resolve(file);
  let shared = open.get(key);
  if (!shared) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    shared = { db, queue: Promise.resolve(), refs: 0 };
    open.set(key, shared);
  }
  shared.refs++;
  const { db } = shared;
  const s = shared;

  const q: Queryable = {
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(toSqlite(sql)).all(...(params as SQLInputValue[])) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return db.prepare(toSqlite(sql)).get(...(params as SQLInputValue[])) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      const result = db.prepare(toSqlite(sql)).run(...(params as SQLInputValue[]));
      return { changes: Number(result.changes) };
    }
  };

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = s.queue.then(fn);
    s.queue = result.catch(() => {});
    return result;
  }

  let closed = false;
  return {
    dialect: 'sqlite',
    transaction: (fn) => exclusive(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(q);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }),
    read: (fn) => exclusive(() => fn(q)),
    exec: (sql) => exclusive(async () => { db.exec(sql); }),
    close: () => exclusive(async () => {
      if (closed) return;
      closed = true;
      if (--s.refs === 0) {
        open.delete(key);
        db.close();
      }
    })
  };
}
