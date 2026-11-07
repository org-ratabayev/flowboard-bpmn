import type { IncomingMessage, ServerResponse } from 'node:http';
import { cleanDisplayName, type Auth, type Identity } from './auth/index.ts';
import type { TokenStore } from './auth/tokenStore.ts';
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
  /** The signed-in user making the request. */
  identity: Identity;
  auth: Pick<Auth, 'kind' | 'canLogout'>;
  tokens: TokenStore;
  /** True when the request was authenticated with an access token rather than a browser session. */
  viaToken: boolean;
}

const TOKEN_EXPIRY_DAYS_MAX = 3650;

async function handleTokens(ctx: ApiContext, req: IncomingMessage, res: ServerResponse, tokenId: string | undefined): Promise<void> {
  // A leaked token must not be able to create more tokens or hide itself.
  if (ctx.viaToken) return send(res, 403, { error: 'Manage access tokens in the app (Settings), not with a token' });
  const userId = ctx.identity.id;
  if (!tokenId && req.method === 'GET') return send(res, 200, await ctx.tokens.list(userId));
  if (!tokenId && req.method === 'POST') {
    const body = await readJson(req, 4096);
    const name = cleanDisplayName(body.name);
    if (!name) return send(res, 400, { error: 'Give the token a name' });
    const days = body.expiresInDays ?? null;
    if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= TOKEN_EXPIRY_DAYS_MAX)) {
      return send(res, 400, { error: `expiresInDays must be a whole number from 1 to ${TOKEN_EXPIRY_DAYS_MAX}, or null for no expiry` });
    }
    try {
      return send(res, 201, await ctx.tokens.create(userId, name, days));
    } catch (err) {
      return send(res, 409, { error: (err as Error).message });
    }
  }
  if (tokenId && req.method === 'DELETE') {
    if (!(await ctx.tokens.revoke(userId, tokenId))) return send(res, 404, { error: 'Token not found' });
    return send(res, 204, '');
  }
  return send(res, 405, { error: 'Method not allowed' });
}

/** Handles /api/projects/…; `parts` is the decoded path split at slashes. */
export async function handleApi(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL
): Promise<void> {
  const { store, live, identity } = ctx;
  const [, resource, id, sub, subId] = parts;
  if (resource === 'me' && parts.length === 2 && req.method === 'GET') {
    return send(res, 200, { id: identity.id, name: identity.name, email: identity.email, provider: identity.provider, canLogout: ctx.auth.canLogout && !ctx.viaToken });
  }
  if (resource === 'tokens' && parts.length <= 3) return handleTokens(ctx, req, res, parts[2]);
  if (resource !== 'projects') return send(res, 404, { error: 'Not found' });

  if (!id) {
    if (req.method === 'GET') return send(res, 200, await store.listProjects());
    if (req.method === 'POST') {
      const body = await readJson(req, MAX_BODY);
      if (body.xml && !looksLikeBpmn(body.xml)) return send(res, 400, { error: 'Not a BPMN file' });
      const newId = await store.createProject(String(body.name || 'Untitled diagram').trim().slice(0, 200), body.xml, identity.name, identity.id);
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
        author: identity.name,
        authorId: identity.id,
        note: body.note,
        baseVersion: body.baseVersion,
        force: !!body.force
      });
      if ('conflict' in result) return send(res, 409, { error: 'conflict', latest: result.conflict });
      const { saved } = result;
      const rev = live.onSaved(id, { xml: body.xml, version: saved.version, author: identity.name, clientId: body.client });
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
    if (req.method === 'GET') return live.handleStream(req, res, id, url, identity.name);
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
