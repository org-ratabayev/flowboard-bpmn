import type { IncomingMessage, ServerResponse } from 'node:http';
import { looksLikeBpmn } from './bpmn.ts';
import type { createChatService } from './chat/chatService.ts';
import { HttpError, readJson, send } from './http.ts';
import type { LiveHub } from './live.ts';
import { isVersionName, type DocumentStore } from './storage/index.ts';

const MAX_BODY = 20 * 1024 * 1024;
const MAX_CHAT_BODY = 60 * 1024 * 1024; // attachments arrive base64-encoded

export interface ApiContext {
  store: DocumentStore;
  live: LiveHub;
  chat: ReturnType<typeof createChatService> | null;
}

/** Handles /api/projects/…; `parts` is the decoded path split at slashes. */
export async function handleApi(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL
): Promise<void> {
  const { store, live } = ctx;
  const [, resource, id, sub, subId] = parts;
  if (resource !== 'projects') return send(res, 404, { error: 'Not found' });

  if (!id) {
    if (req.method === 'GET') return send(res, 200, await store.listProjects());
    if (req.method === 'POST') {
      const body = await readJson(req, MAX_BODY);
      if (body.xml && !looksLikeBpmn(body.xml)) return send(res, 400, { error: 'Not a BPMN file' });
      const newId = await store.createProject(String(body.name || 'Untitled diagram').trim().slice(0, 200), body.xml, body.author);
      return send(res, 201, { id: newId });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (!(await store.hasProject(id))) return send(res, 404, { error: 'Project not found' });

  if (!sub) {
    if (req.method === 'GET') {
      const [meta, xml, version] = await Promise.all([store.readMeta(id), store.readLatest(id), store.currentVersion(id)]);
      // unsaved changes shared by people currently editing take precedence over the saved file
      const shared = live.liveDoc(id);
      return send(res, 200, {
        id,
        name: meta.name || id,
        version,
        xml: shared ? shared.xml : xml,
        rev: shared ? shared.rev : 0,
        dirty: shared ? shared.dirty : false
      });
    }
    if (req.method === 'PUT') {
      const body = await readJson(req, MAX_BODY);
      if (!looksLikeBpmn(body.xml)) return send(res, 400, { error: 'Not a BPMN diagram' });
      const result = await store.saveVersion(id, body.xml, {
        author: body.author,
        note: body.note,
        baseVersion: body.baseVersion,
        force: !!body.force
      });
      if ('conflict' in result) return send(res, 409, { error: 'conflict', latest: result.conflict });
      const { saved } = result;
      const rev = live.onSaved(id, { xml: body.xml, version: saved.version, author: body.author, clientId: body.client });
      return send(res, 200, { ...saved, rev });
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req, MAX_BODY);
      const meta = await store.renameProject(id, body.name ? String(body.name).trim().slice(0, 200) : undefined);
      return send(res, 200, { id, name: meta.name });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (sub === 'live') {
    if (req.method === 'GET') return live.handleStream(req, res, id, url);
    if (req.method === 'POST') {
      const result = live.handlePost(id, await readJson(req, MAX_BODY));
      return send(res, result.status, result.body);
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (sub === 'chat' && req.method === 'POST') {
    if (!ctx.chat) return send(res, 403, { error: 'Chat is disabled on this server' });
    const body = await readJson(req, MAX_CHAT_BODY);
    try {
      return send(res, 200, await ctx.chat.chat(id, body));
    } catch (err) {
      return send(res, err instanceof HttpError ? err.status : 502, { error: (err as Error).message });
    }
  }

  if (sub === 'history' && req.method === 'GET') {
    if (!subId) return send(res, 200, await store.listVersions(id));
    if (!isVersionName(subId)) return send(res, 400, { error: 'Bad version' });
    const xml = await store.readVersion(id, subId);
    if (xml === null) return send(res, 404, { error: 'Version not found' });
    return send(res, 200, { version: subId, xml });
  }

  if (sub === 'download' && req.method === 'GET') {
    const v = url.searchParams.get('version');
    if (v && !isVersionName(v)) return send(res, 400, { error: 'Bad version' });
    const xml = v ? await store.readVersion(id, v) : await store.readLatest(id);
    if (xml === null) return send(res, 404, { error: 'Not found' });
    return send(res, 200, Buffer.from(xml), {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}${v ? '-' + v : ''}.bpmn"`
    });
  }

  return send(res, 404, { error: 'Not found' });
}
