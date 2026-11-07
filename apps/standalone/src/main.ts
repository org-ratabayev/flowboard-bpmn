// Default entry point: settings come from .env at the repository root, the environment
// and an optional APP_CONFIG module (see README).

import os from 'node:os';
import path from 'node:path';
import { createServer, loadConfigFromEnv } from '@flowboard/server';
import { publicDir } from '@flowboard/web';

const root = path.resolve(import.meta.dirname, '..', '..', '..');

// Variables already set in the environment take precedence over .env.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch { /* no .env: use defaults */ }

const config = await loadConfigFromEnv({
  defaults: {
    publicDir,
    licensesFile: path.join(root, 'THIRD_PARTY_LICENSES.md')
  }
});
const server = createServer(config);
const { port } = await server.listen();

console.log(`BPMN editor running. Files are stored in ${config.dataDir}`);
console.log(`  Local:   http://localhost:${port}/`);
for (const addrs of Object.values(os.networkInterfaces())) {
  for (const a of addrs || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`  Network: http://${a.address}:${port}/`);
  }
}

const shutdown = () => server.close().then(() => process.exit(0), () => process.exit(1));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
