// An empty in-memory Postgres (PGlite) served over the normal wire protocol for tests.
// Usage: node test/helpers/pglite-server.mjs <port>   (prints "ready" once it accepts connections)
//
// PGlite runs one session; the socket server would multiplex several connections into it,
// which mixes up their transactions, so it accepts one connection and clients use a pool of one.

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.argv[2]);
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 1 });
await server.start();
console.log('ready');

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
