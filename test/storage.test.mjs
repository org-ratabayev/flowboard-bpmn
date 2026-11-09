// Moving from the folder layout to the database: import on first start and the CLI commands.

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ROOT, diagram, startServer } from './helpers/server.mjs';

const run = promisify(execFile);
const V1 = '2026-01-01T10-00-00-000Z';

async function writeProjectFolder(dataDir, id, name) {
  await fs.mkdir(path.join(dataDir, id, 'history'), { recursive: true });
  await fs.writeFile(path.join(dataDir, id, 'project.json'), JSON.stringify({ name, createdAt: '2026-01-01T10:00:00.000Z' }));
  await fs.writeFile(path.join(dataDir, id, 'history', `${V1}.bpmn`), diagram(name));
  await fs.writeFile(path.join(dataDir, id, 'history', 'log.jsonl'),
    JSON.stringify({ version: V1, at: '2026-01-01T10:00:00.000Z', author: 'Ann', note: 'Created', size: 1 }) + '\n');
  await fs.writeFile(path.join(dataDir, id, `${id}.bpmn`), diagram(name));
}

describe('first start', () => {
  const servers = [];
  after(() => Promise.all(servers.map((s) => s.stop())));

  it('imports project folders found in the data folder and leaves them unchanged', async () => {
    const server = await startServer({}, { files: (dir) => writeProjectFolder(dir, 'order-flow', 'Order Flow') });
    servers.push(server);
    const list = (await server.request('GET', '/api/projects')).body;
    assert.deepEqual(list.map((p) => [p.id, p.name, p.versionCount, p.updatedBy]), [['order-flow', 'Order Flow', 1, 'Ann']]);
    const history = (await server.request('GET', '/api/projects/order-flow/history')).body;
    assert.deepEqual(history.map((v) => [v.version, v.author, v.note]), [[V1, 'Ann', 'Created']]);
    assert.match(server.output(), /Imported 1 project folder/);
    // imported before anyone signed in: it belongs to the first user who did, and stays private
    assert.equal(list[0].role, 'owner');
    assert.equal(list[0].owner.name, 'Tester');
    assert.deepEqual((await server.as('Second user')('GET', '/api/projects')).body, []);
    assert.equal(await fs.readFile(path.join(server.dataDir, 'order-flow', 'order-flow.bpmn'), 'utf8'), diagram('Order Flow'));
  });

  it('can be told not to import', async () => {
    const server = await startServer({ IMPORT_ON_FIRST_START: 'off' }, { files: (dir) => writeProjectFolder(dir, 'order-flow', 'Order Flow') });
    servers.push(server);
    assert.deepEqual((await server.request('GET', '/api/projects')).body, []);
  });
});

describe('flowboard CLI', () => {
  const cli = (args, env) =>
    run(process.execPath, ['--disable-warning=ExperimentalWarning', 'apps/standalone/src/cli.ts', ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: '', STORAGE: 'sqlite', ...env }
    });

  it('imports and exports project folders', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
    try {
      const env = { BPMN_DIR: path.join(tmp, 'data'), SQLITE_PATH: path.join(tmp, 'db.sqlite') };
      await writeProjectFolder(path.join(tmp, 'old'), 'one', 'One');
      await writeProjectFolder(path.join(tmp, 'old'), 'two', 'Two');

      const dry = await cli(['import', '--from', path.join(tmp, 'old'), '--dry-run'], env);
      assert.match(dry.stdout, /Dry run/);
      assert.match(dry.stdout, /would import\s+one → one \(1 versions\)/);

      const first = await cli(['import', '--from', path.join(tmp, 'old')], env);
      assert.match(first.stdout, /imported\s+one → one/);
      assert.match(first.stdout, /imported\s+two → two/);
      const again = await cli(['import', '--from', path.join(tmp, 'old')], env);
      assert.match(again.stdout, /skipped\s+one → one/);

      const exported = await cli(['export', '--to', path.join(tmp, 'out')], env);
      assert.match(exported.stdout, /Exported 2 project\(s\)/);
      for (const id of ['one', 'two']) {
        assert.equal(
          await fs.readFile(path.join(tmp, 'out', id, `${id}.bpmn`), 'utf8'),
          await fs.readFile(path.join(tmp, 'old', id, `${id}.bpmn`), 'utf8')
        );
        assert.equal(
          await fs.readFile(path.join(tmp, 'out', id, 'history', `${V1}.bpmn`), 'utf8'),
          await fs.readFile(path.join(tmp, 'old', id, 'history', `${V1}.bpmn`), 'utf8')
        );
      }

      await assert.rejects(cli(['export', '--to', path.join(tmp, 'out')], env), /not empty/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('prints usage for unknown commands', async () => {
    await assert.rejects(cli(['frobnicate'], {}), (err) => err.code === 1 && /Usage:/.test(err.stderr));
    await assert.rejects(cli(['restore'], {}), (err) => err.code === 1 && /Usage:/.test(err.stderr));
  });

  it('lists, restores and purges deleted projects of a running server', async () => {
    // the CLI reaches the server's database file, so this test always uses SQLite
    const server = await startServer({ DATABASE_URL: '', STORAGE: 'sqlite', APP_SECRET: '' });
    try {
      const env = { BPMN_DIR: server.dataDir };
      const owner = server.as('Olivia');
      const id = (await owner('POST', '/api/projects', { name: 'Recover me', xml: diagram('Recover') })).body.id;
      await server.grant(id, 'Eddie', 'editor', 'Olivia');
      assert.equal((await owner('DELETE', `/api/projects/${id}`)).status, 204);
      assert.equal((await server.as('Eddie')('GET', `/api/projects/${id}`)).status, 404);

      const listed = await cli(['deleted'], env);
      assert.match(listed.stdout, /^1 deleted project\(s\)/);
      assert.match(listed.stdout, new RegExp(`${id}  "Recover me"  deleted \\S+ by Olivia, owner Olivia, 1 versions`));

      assert.match((await cli(['restore', id], env)).stdout, new RegExp(`Restored ${id}`));
      assert.equal((await server.as('Eddie')('GET', `/api/projects/${id}`)).body.role, 'editor');
      assert.ok((await server.as('Eddie')('GET', '/api/projects')).body.some((p) => p.id === id));
      const log = (await owner('GET', `/api/projects/${id}/access/log`)).body.map((e) => e.action);
      assert.deepEqual(log.slice(0, 2), ['project.restore', 'project.delete']);
      await assert.rejects(cli(['restore', id], env), (err) => err.code === 1 && /No deleted project/.test(err.stderr));

      // purging needs --yes, and only works on deleted projects
      await assert.rejects(cli(['purge', id, '--yes'], env), (err) => err.code === 1 && /only deleted projects/.test(err.stderr));
      await owner('DELETE', `/api/projects/${id}`);
      await assert.rejects(cli(['purge', id], env), (err) => err.code === 1 && /--yes/.test(err.stderr));
      assert.match((await cli(['purge', id, '--yes'], env)).stdout, new RegExp(`Purged ${id}`));
      assert.match((await cli(['deleted'], env)).stdout, /^0 deleted project\(s\)/);
      await assert.rejects(cli(['restore', id], env), /No deleted project/);
    } finally {
      await server.stop();
    }
  });
});
