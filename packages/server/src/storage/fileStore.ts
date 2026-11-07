// Project storage in plain files, usable without this server:
//   <dataDir>/<project-id>/<project-id>.bpmn      latest version
//   <dataDir>/<project-id>/project.json           { name, createdAt }
//   <dataDir>/<project-id>/history/<version>.bpmn every saved version
//   <dataDir>/<project-id>/history/log.jsonl      one line per save: who / when / note

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_DIAGRAM } from '../bpmn.ts';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;

export const isProjectId = (id: string) => ID_RE.test(id);
export const isVersionName = (version: string) => VERSION_RE.test(version);

export interface ProjectMeta {
  name: string;
  createdAt?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  versionCount: number;
}

/** A saved version; the log fields are missing when log.jsonl has no entry for it. */
export interface VersionInfo {
  version: string;
  at?: string;
  author?: string | null;
  note?: string | null;
  size?: number;
}

export interface SaveOptions {
  author?: string | null;
  note?: string | null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, file);
}

function slugify(name: string): string {
  return String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diagram';
}

function newVersionName(existing: Set<string>): string {
  const base = new Date().toISOString().replace(/[:.]/g, '-');
  let name = base;
  let n = 1;
  while (existing.has(name)) name = `${base}-${n++}`;
  return name;
}

export type FileStore = ReturnType<typeof createFileStore>;

export function createFileStore(dataDir: string) {
  const projectDir = (id: string) => path.join(dataDir, id);
  const latestFile = (id: string) => path.join(projectDir(id), `${id}.bpmn`);
  const historyDir = (id: string) => path.join(projectDir(id), 'history');
  const metaFile = (id: string) => path.join(projectDir(id), 'project.json');

  async function readMeta(id: string): Promise<ProjectMeta> {
    try {
      return JSON.parse(await fsp.readFile(metaFile(id), 'utf8'));
    } catch {
      return { name: id };
    }
  }

  async function listVersions(id: string): Promise<VersionInfo[]> {
    let files: string[];
    try {
      files = await fsp.readdir(historyDir(id));
    } catch {
      return [];
    }
    const log = new Map<string, VersionInfo>();
    try {
      const lines = (await fsp.readFile(path.join(historyDir(id), 'log.jsonl'), 'utf8')).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          log.set(entry.version, entry);
        } catch { /* skip corrupt line */ }
      }
    } catch { /* no log yet */ }
    return files
      .filter((f) => f.endsWith('.bpmn'))
      .map((f) => f.slice(0, -5))
      .filter(isVersionName)
      .sort()
      .reverse()
      .map((version) => ({ version, ...log.get(version) }));
  }

  async function currentVersion(id: string): Promise<string | null> {
    const versions = await listVersions(id);
    return versions.length ? versions[0].version : null;
  }

  async function saveVersion(id: string, xml: string, { author, note }: SaveOptions): Promise<{ version: string; at: string }> {
    await fsp.mkdir(historyDir(id), { recursive: true });
    const existing = new Set((await listVersions(id)).map((v) => v.version));
    const version = newVersionName(existing);
    const at = new Date().toISOString();
    await writeAtomic(path.join(historyDir(id), `${version}.bpmn`), xml);
    await writeAtomic(latestFile(id), xml);
    await fsp.appendFile(
      path.join(historyDir(id), 'log.jsonl'),
      JSON.stringify({ version, at, author: author || null, note: note || null, size: Buffer.byteLength(xml) }) + '\n'
    );
    return { version, at };
  }

  return {
    /** True when `id` is a valid project id and the project has a latest file. */
    async hasProject(id: string): Promise<boolean> {
      return isProjectId(id) && exists(latestFile(id));
    },

    async listProjects(): Promise<ProjectSummary[]> {
      await fsp.mkdir(dataDir, { recursive: true });
      const entries = await fsp.readdir(dataDir, { withFileTypes: true });
      const projects: ProjectSummary[] = [];
      for (const e of entries) {
        if (!e.isDirectory() || !isProjectId(e.name)) continue;
        if (!(await exists(latestFile(e.name)))) continue;
        const meta = await readMeta(e.name);
        const versions = await listVersions(e.name);
        const stat = await fsp.stat(latestFile(e.name));
        projects.push({
          id: e.name,
          name: meta.name || e.name,
          createdAt: meta.createdAt || null,
          updatedAt: versions[0]?.at || stat.mtime.toISOString(),
          updatedBy: versions[0]?.author || null,
          versionCount: versions.length
        });
      }
      return projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },

    async createProject(name: string, xml: string | undefined, author: string | null | undefined): Promise<string> {
      await fsp.mkdir(dataDir, { recursive: true });
      const base = slugify(name);
      let id = base;
      let n = 2;
      while (await exists(projectDir(id))) id = `${base}-${n++}`;
      await fsp.mkdir(historyDir(id), { recursive: true });
      await writeAtomic(metaFile(id), JSON.stringify({ name: name || id, createdAt: new Date().toISOString() }, null, 2));
      await saveVersion(id, xml || EMPTY_DIAGRAM, { author, note: 'Created' });
      return id;
    },

    readMeta,

    async renameProject(id: string, name: string | undefined): Promise<ProjectMeta> {
      const meta = await readMeta(id);
      if (name !== undefined) meta.name = name;
      await writeAtomic(metaFile(id), JSON.stringify(meta, null, 2));
      return meta;
    },

    readLatest: (id: string) => fsp.readFile(latestFile(id), 'utf8'),

    listVersions,
    currentVersion,

    /** One saved version, or null when it does not exist. */
    async readVersion(id: string, version: string): Promise<string | null> {
      try {
        return await fsp.readFile(path.join(historyDir(id), `${version}.bpmn`), 'utf8');
      } catch {
        return null;
      }
    },

    /** Raw bytes of the latest file or of one version, or null when missing. */
    async readFileBytes(id: string, version?: string): Promise<Buffer | null> {
      try {
        return await fsp.readFile(version ? path.join(historyDir(id), `${version}.bpmn`) : latestFile(id));
      } catch {
        return null;
      }
    },

    saveVersion
  };
}
