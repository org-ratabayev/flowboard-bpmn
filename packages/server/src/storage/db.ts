// A thin database layer so one SQL store works with SQLite and Postgres.
// SQL is written with Postgres-style $1, $2 … placeholders; the SQLite driver rewrites them.

export type Dialect = 'sqlite' | 'postgres';

export interface Queryable {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

export interface Db {
  dialect: Dialect;
  /** Runs `fn` in a transaction; it commits when `fn` resolves and rolls back when it throws. */
  transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Runs read-only queries without a transaction. */
  read<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Executes a script of several statements (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Timestamps come back as Date from Postgres and as ISO strings from SQLite. */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
