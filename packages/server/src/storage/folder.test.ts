import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportToFolder, importFromFolder } from './folder.ts';
import type { DocumentStore } from './sqlStore.ts';
import { backends } from './testBackends.ts';

const xml = (label: string) => `<?xml version="1.0"?>\n<bpmn:definitions id="D"><bpmn:task name="${label}"/></bpmn:definitions>\n`;
const V1 = '2026-01-01T10-00-00-000Z';
const V2 = '2026-01-02T11-30-00-500Z';

/** A data folder in the layout the app used before the database. */
async function writeFolder(dir: string) {
  const write = async (rel: string, content: string) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content);
  };
  // A regular project with two versions and a log.
  await write('order-flow/project.json', JSON.stringify({ name: 'Order Flow', createdAt: '2026-01-01T10:00:00.000Z' }, null, 2));
  await write(`order-flow/history/${V1}.bpmn`, xml('one'));
  await write(`order-flow/history/${V2}.bpmn`, xml('two'));
  await write('order-flow/history/log.jsonl',
    JSON.stringify({ version: V1, at: '2026-01-01T10:00:00.000Z', author: 'Ann', note: 'Created', size: 1 }) + '\n' +
    'not json\n' +
    JSON.stringify({ version: V2, at: '2026-01-02T11:30:00.500Z', author: 'Bob', note: 'More', size: 1 }) + '\n');
  await write('order-flow/order-flow.bpmn', xml('two'));
  // History without a log and without project.json.
  await write(`no-log/history/${V1}.bpmn`, xml('a'));
  await write('no-log/no-log.bpmn', xml('a'));
  // Latest file edited outside the app after the last saved version.
  await write(`edited/history/${V1}.bpmn`, xml('saved'));
  await write('edited/edited.bpmn', xml('edited by hand'));
  // Only a latest file.
  await write('bare/bare.bpmn', xml('bare'));
  // Not projects.
  await write('Not-A-Project/Not-A-Project.bpmn', xml('x'));
  await write('no-latest-file/history/x.bpmn', xml('x'));
  await write('notes.txt', 'hello');
}

async function readTree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full)] = await fs.readFile(full, 'utf8');
  }
  return out;
}

describe('folder import and export', () => {
  let tmp: string;
  let store: DocumentStore;
  let cleanup: () => Promise<void>;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'folder-test-'));
    await writeFolder(path.join(tmp, 'data'));
    ({ store, cleanup } = await backends[0].open());
  });
  afterEach(async () => {
    await cleanup();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('imports project folders with their history and skips everything else', async () => {
    const results = await importFromFolder(store, path.join(tmp, 'data'));
    expect(results).toEqual([
      { folder: 'bare', id: 'bare', status: 'imported', versions: 1 },
      { folder: 'edited', id: 'edited', status: 'imported', versions: 2 },
      { folder: 'no-log', id: 'no-log', status: 'imported', versions: 1 },
      { folder: 'order-flow', id: 'order-flow', status: 'imported', versions: 2 }
    ]);

    expect(await store.readMeta('order-flow')).toEqual({ name: 'Order Flow', createdAt: '2026-01-01T10:00:00.000Z' });
    expect(await store.listVersions('order-flow')).toEqual([
      { version: V2, at: '2026-01-02T11:30:00.500Z', author: 'Bob', note: 'More', size: Buffer.byteLength(xml('two')) },
      { version: V1, at: '2026-01-01T10:00:00.000Z', author: 'Ann', note: 'Created', size: Buffer.byteLength(xml('one')) }
    ]);
    expect(await store.readVersion('order-flow', V1)).toBe(xml('one'));

    expect(await store.readMeta('no-log')).toEqual({ name: 'no-log', createdAt: null });
    expect((await store.listVersions('no-log'))[0]).toMatchObject({ version: V1, at: '2026-01-01T10:00:00.000Z', author: null });

    const edited = await store.listVersions('edited');
    expect(edited[0].note).toBe('Imported (latest file)');
    expect(await store.readLatest('edited')).toBe(xml('edited by hand'));
    expect((await store.listVersions('bare'))[0].note).toBe('Imported');
  });

  it('skips projects imported before, and reports a dry run without importing', async () => {
    const dry = await importFromFolder(store, path.join(tmp, 'data'), { dryRun: true });
    expect(dry.map((r) => r.status)).toEqual(Array(4).fill('would import'));
    expect(await store.countProjects()).toBe(0);
    await importFromFolder(store, path.join(tmp, 'data'));
    const again = await importFromFolder(store, path.join(tmp, 'data'));
    expect(again.map((r) => r.status)).toEqual(Array(4).fill('skipped'));
    expect(await store.countProjects()).toBe(4);
  });

  it('returns nothing for a missing folder', async () => {
    expect(await importFromFolder(store, path.join(tmp, 'missing'))).toEqual([]);
  });

  it('exports the same layout, and export → import → export is identical', async () => {
    await importFromFolder(store, path.join(tmp, 'data'));
    const out1 = path.join(tmp, 'out1');
    expect(await exportToFolder(store, out1)).toHaveLength(4);
    const tree1 = await readTree(out1);

    // Every version file and latest file is byte-identical to the source.
    const source = await readTree(path.join(tmp, 'data'));
    for (const file of [`order-flow/history/${V1}.bpmn`, `order-flow/history/${V2}.bpmn`, 'order-flow/order-flow.bpmn',
      `no-log/history/${V1}.bpmn`, 'no-log/no-log.bpmn', 'edited/edited.bpmn', 'bare/bare.bpmn']) {
      expect(tree1[file], file).toBe(source[file]);
    }
    expect(JSON.parse(tree1['order-flow/project.json'])).toEqual({ name: 'Order Flow', createdAt: '2026-01-01T10:00:00.000Z' });
    expect(tree1['order-flow/history/log.jsonl'].trim().split('\n').map((l) => JSON.parse(l))).toEqual([
      { version: V1, at: '2026-01-01T10:00:00.000Z', author: 'Ann', note: 'Created', size: Buffer.byteLength(xml('one')) },
      { version: V2, at: '2026-01-02T11:30:00.500Z', author: 'Bob', note: 'More', size: Buffer.byteLength(xml('two')) }
    ]);

    const second = await backends[0].open();
    try {
      await importFromFolder(second.store, out1);
      const out2 = path.join(tmp, 'out2');
      await exportToFolder(second.store, out2);
      expect(await readTree(out2)).toEqual(tree1);
    } finally {
      await second.cleanup();
    }
  });

  it('refuses to export into a folder that is not empty', async () => {
    await expect(exportToFolder(store, path.join(tmp, 'data'))).rejects.toThrow('not empty');
  });
});
