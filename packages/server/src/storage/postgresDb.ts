import pg from 'pg';
import type { Db, Queryable } from './db.ts';

function queryable(client: pg.Pool | pg.PoolClient): Queryable {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return (await client.query(sql, params)).rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (await client.query(sql, params)).rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      return { changes: (await client.query(sql, params)).rowCount ?? 0 };
    }
  };
}

export function openPostgres(connectionString: string, poolSize: number): Db {
  const pool = new pg.Pool({ connectionString, max: poolSize });
  // An idle client losing its connection must not crash the process; the pool replaces it.
  pool.on('error', (err) => console.error('Postgres connection error:', err.message));

  return {
    dialect: 'postgres',
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(queryable(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    read: (fn) => fn(queryable(pool)),
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end()
  };
}
