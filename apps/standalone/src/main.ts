// Default entry point: settings come from .env at the repository root, the environment
// and an optional APP_CONFIG module (see README).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, loadConfigFromEnv } from '@flowboard/server';
import { publicDir } from '@flowboard/web';

const root = path.resolve(import.meta.dirname, '..', '..', '..');

// Variables already set in the environment take precedence over .env.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch { /* no .env: use defaults */ }

if (!fs.existsSync(path.join(publicDir, 'editor.html'))) {
  console.error('The browser app is not built yet. Run "pnpm build" (or start with "pnpm start", which builds first).');
  process.exit(1);
}

const config = await loadConfigFromEnv({
  defaults: {
    publicDir,
    licensesFile: path.join(root, 'THIRD_PARTY_LICENSES.md')
  }
});
const server = createServer(config);
const { port } = await server.listen();

const where = config.storage.kind === 'postgres' ? 'Postgres' : config.storage.sqlitePath;
console.log(`BPMN editor running. Projects are stored in ${where}`);
const imported = server.imported.filter((r) => r.status === 'imported');
if (imported.length) {
  console.log(`  Imported ${imported.length} project folder(s) from ${config.dataDir} (the folders were not changed):`);
  for (const r of imported) console.log(`    ${r.folder} → ${r.id} (${r.versions} versions)`);
}
console.log(`  Local:   http://localhost:${port}/`);
for (const addrs of Object.values(os.networkInterfaces())) {
  for (const a of addrs || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`  Network: http://${a.address}:${port}/`);
  }
}

const loopback = ['127.0.0.1', '::1', 'localhost'].includes(config.host);
if (config.auth.kind === 'dev' && !loopback) {
  console.warn(
    '\n  WARNING: sign-in is in dev mode (a name, no password) and the server accepts connections from the network.\n' +
    '  Anyone who can reach it can sign in as anyone. Use HOST=127.0.0.1, or AUTH=trusted-headers behind an\n' +
    '  authenticating proxy, before exposing it beyond a trusted network.\n'
  );
}

const shutdown =() => server.close().then(() => process.exit(0), () => process.exit(1));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
