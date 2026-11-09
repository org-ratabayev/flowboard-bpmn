// Import from and export to the plain-folder layout used before the database:
//   <dir>/<project-id>/<project-id>.bpmn      latest version (open it with any BPMN tool)
//   <dir>/<project-id>/project.json           { name, createdAt, deletedAt? }
//   <dir>/<project-id>/history/<version>.bpmn every saved version
//   <dir>/<project-id>/history/log.jsonl      one line per version: version, at, author, note, size
//
// Exports hold names, dates and versions (not owners, sharing, chats or the log) and include
// soft-deleted projects (with `deletedAt`); importing such a folder adds the project as deleted
// again (an admin can restore it).

import fsp from 'node:fs/promises';
import path from 'node:path';
import { isProjectId, isVersionName, type DocumentStore, type ImportedProject } from './sqlStore.ts';

export interface ImportResult {
  folder: string;
  id: string;
  status: 'imported' | 'skipped' | 'would import';
  versions: number;
  /** The folder holds a project that was deleted when it was exported. */
  deleted: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/** '2026-11-05T12-35-39-675Z' (optionally with a -n suffix) → '2026-11-05T12:35:39.675Z'. */
function versionNameToIso(name: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name)!;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}

/** Reads one project folder; null when it is not a project (no valid id or no latest file). */
export async function readProjectFolder(dir: string): Promise<ImportedProject | null> {
  const id = path.basename(dir);
  const latestFile = path.join(dir, `${id}.bpmn`);
  if (!isProjectId(id) || !(await exists(latestFile))) return null;

  let meta: { name?: string; createdAt?: string; deletedAt?: unknown } = {};
  try {
    meta = JSON.parse(await fsp.readFile(path.join(dir, 'project.json'), 'utf8'));
  } catch { /* no metadata: use the folder name */ }

  const historyDir = path.join(dir, 'history');
  const log = new Map<string, { at?: string; author?: string | null; note?: string | null }>();
  try {
    for (const line of (await fsp.readFile(path.join(historyDir, 'log.jsonl'), 'utf8')).split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        log.set(entry.version, entry);
      } catch { /* skip corrupt line */ }
    }
  } catch { /* no log */ }

  let names: string[] = [];
  try {
    names = (await fsp.readdir(historyDir)).filter((f) => f.endsWith('.bpmn')).map((f) => f.slice(0, -5)).filter(isVersionName).sort();
  } catch { /* no history */ }

  const versions: ImportedProject['versions'] = [];
  for (const name of names) {
    const entry = log.get(name);
    versions.push({
      name,
      at: entry?.at || versionNameToIso(name),
      xml: await fsp.readFile(path.join(historyDir, `${name}.bpmn`), 'utf8'),
      author: entry?.author ?? null,
      note: entry?.note ?? null
    });
  }

  // A latest file that differs from the newest history entry (edited outside the app) becomes one more version.
  const latest = await fsp.readFile(latestFile, 'utf8');
  if (versions.at(-1)?.xml !== latest) {
    const at = (await fsp.stat(latestFile)).mtime.toISOString();
    let name = at.replace(/[:.]/g, '-');
    for (let n = 1; names.includes(name); n++) name = `${at.replace(/[:.]/g, '-')}-${n}`;
    versions.push({ name, at, xml: latest, author: null, note: versions.length ? 'Imported (latest file)' : 'Imported' });
  }

  // fails closed: any deletedAt that is set but not a valid date still imports the project as deleted (as of now)
  const marked = meta.deletedAt !== undefined && meta.deletedAt !== null;
  const parsed = typeof meta.deletedAt === 'string' ? Date.parse(meta.deletedAt) : NaN;
  const deletedAt = !marked ? null : new Date(Number.isNaN(parsed) ? Date.now() : parsed).toISOString();
  return { id, name: meta.name || id, createdAt: meta.createdAt || null, importKey: `folder:${id}`, versions, deletedAt };
}

/** Imports every project folder in `dir`. Projects imported before are skipped. */
export async function importFromFolder(store: DocumentStore, dir: string, { dryRun = false } = {}): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries.filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const project = await readProjectFolder(path.join(dir, e.name));
    if (!project) continue;
    if (dryRun) {
      results.push({ folder: e.name, id: project.id, status: 'would import', versions: project.versions.length, deleted: !!project.deletedAt });
      continue;
    }
    const { id, status } = await store.importProject(project);
    results.push({ folder: e.name, id, status, versions: project.versions.length, deleted: !!project.deletedAt });
  }
  return results;
}

/**
 * Writes every project in the folder layout to `dir`, which must not exist yet or be empty.
 * Soft-deleted projects are included, marked with `deletedAt` in project.json.
 */
export async function exportToFolder(store: DocumentStore, dir: string): Promise<{ id: string; versions: number; deleted: boolean }[]> {
  if (await exists(dir)) {
    if ((await fsp.readdir(dir)).length) throw new Error(`Export folder is not empty: ${dir}`);
  }
  const deleted = await store.listDeletedProjects();
  const projects = [
    ...(await store.listProjects()).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, deletedAt: null as string | null })),
    ...await Promise.all(deleted.map(async (p) => ({ id: p.id, name: p.name, createdAt: (await store.readMeta(p.id)).createdAt, deletedAt: p.deletedAt })))
  ];
  const results = [];
  for (const project of projects) {
    const projectDir = path.join(dir, project.id);
    const historyDir = path.join(projectDir, 'history');
    await fsp.mkdir(historyDir, { recursive: true });
    const meta = {
      name: project.name,
      ...(project.createdAt ? { createdAt: project.createdAt } : {}),
      ...(project.deletedAt ? { deletedAt: project.deletedAt } : {})
    };
    await fsp.writeFile(path.join(projectDir, 'project.json'), JSON.stringify(meta, null, 2));

    const versions = (await store.listVersions(project.id)).reverse();
    const log: string[] = [];
    let latest = '';
    for (const v of versions) {
      latest = (await store.readVersion(project.id, v.version))!;
      await fsp.writeFile(path.join(historyDir, `${v.version}.bpmn`), latest);
      log.push(JSON.stringify({ version: v.version, at: v.at, author: v.author, note: v.note, size: v.size }));
    }
    await fsp.writeFile(path.join(historyDir, 'log.jsonl'), log.length ? log.join('\n') + '\n' : '');
    await fsp.writeFile(path.join(projectDir, `${project.id}.bpmn`), versions.length ? latest : await store.readLatest(project.id));
    results.push({ id: project.id, versions: versions.length, deleted: !!project.deletedAt });
  }
  return results;
}
