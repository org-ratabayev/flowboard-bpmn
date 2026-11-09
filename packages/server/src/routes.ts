// /api…  The JSON API below the authentication of server.ts: the signed-in user, access tokens,
// users, share links, and the project routes (role check first, then delete, access, live,
// history, download and the chat, which is dispatched to chat/agentRoutes.ts).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { cleanDisplayName, type Auth, type Identity } from './auth/index.ts';
import type { TokenStore } from './auth/tokenStore.ts';
import { looksLikeBpmn } from './bpmn.ts';
import { handleAgentChat, type AgentChat } from './chat/agentRoutes.ts';
import { readJson, send } from './http.ts';
import type { EventBus } from './events.ts';
import type { LiveHub } from './live.ts';
import { atLeast, isGrantRole, isVisibility, normalizeEmail, type AccessStore, type Role } from './storage/accessStore.ts';
import { isProjectId, isVersionName, type DocumentStore } from './storage/index.ts';

const MAX_BODY = 20 * 1024 * 1024;

export interface ApiContext {
  store: DocumentStore;
  live: LiveHub;
  /** Chat with the configured AI providers (agent loop); null when chat is off or no provider is configured. */
  agentChat: AgentChat | null;
  /** The user's token from the sign-in, for AI providers using the user's identity (never with access tokens). */
  upstreamToken: string | null;
  /** The signed-in user making the request. */
  identity: Identity;
  auth: Pick<Auth, 'kind' | 'canLogout'>;
  tokens: TokenStore;
  access: AccessStore;
  /** Announces access changes so connected people get their new role at once. */
  events: EventBus;
  /** True when the request was authenticated with an access token rather than a browser session. */
  viaToken: boolean;
}

const TOKEN_EXPIRY_DAYS_MAX = 3650;

const LINK_EXPIRY_DAYS_MAX = 365;

const validExpiry = (days: unknown, max: number): days is number | null =>
  days === null || (typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= max);

/**
 * /api/projects/:id/access…  Everyone with access sees who else has it; only the owner changes it.
 *   GET                        owner, visibility, members (plus links and invitations for the owner)
 *   PATCH  { visibility }      'private' or 'everyone' (every signed-in user can view)
 *   PUT    members/:userId { role }   give or change a role ('viewer' | 'editor')
 *   DELETE members/:userId     remove it (the user may also remove their own access)
 *   POST   links { role, expiresInDays }   create a share link (its token is returned once)
 *   DELETE links/:linkId       revoke a link, removing everyone who joined through it
 *   POST   invites { email, role }   invite by email (a known user gets access at once)
 *   DELETE invites/:email      cancel an invitation
 *   GET    log                 access changes, newest first (owner)
 */
async function handleAccess(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  rest: string[],
  role: Role,
  allowed: (minimum: Role) => boolean
): Promise<void> {
  const { access, identity } = ctx;
  const current = () => access.access(id, { forOwner: role === 'owner' });
  const [kind, key] = rest;

  if (rest.length === 0) {
    if (req.method === 'GET') return send(res, 200, await current());
    if (req.method === 'PATCH') {
      if (!allowed('owner')) return;
      const { visibility } = await readJson(req, 4096);
      if (!isVisibility(visibility)) return send(res, 400, { error: "visibility must be 'private' or 'everyone'" });
      await access.setVisibility(id, visibility, identity.id);
      await ctx.events.publish('access', id);
      return send(res, 200, await current());
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (kind === 'members' && rest.length === 2) {
    if (req.method === 'PUT') {
      if (!allowed('owner')) return;
      const { role: newRole } = await readJson(req, 4096);
      if (!isGrantRole(newRole)) return send(res, 400, { error: "role must be 'viewer' or 'editor'" });
      const result = await access.grant(id, key, newRole, identity.id);
      if (result === 'unknown-user') return send(res, 404, { error: 'User not found' });
      if (result === 'owner') return send(res, 400, { error: 'The owner already has full access' });
      await ctx.events.publish('access', id);
      return send(res, 200, await current());
    }
    if (req.method === 'DELETE') {
      if (key !== identity.id && !allowed('owner')) return;
      if (!(await access.revoke(id, key, identity.id))) return send(res, 404, { error: 'This user has no access to remove' });
      await ctx.events.publish('access', id);
      return send(res, 204, '');
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (kind === 'links' && (rest.length === 1 || rest.length === 2)) {
    if (!allowed('owner')) return;
    if (rest.length === 1 && req.method === 'POST') {
      const { role: linkRole, expiresInDays = null } = await readJson(req, 4096);
      if (!isGrantRole(linkRole)) return send(res, 400, { error: "role must be 'viewer' or 'editor'" });
      if (!validExpiry(expiresInDays, LINK_EXPIRY_DAYS_MAX)) {
        return send(res, 400, { error: `expiresInDays must be a whole number from 1 to ${LINK_EXPIRY_DAYS_MAX}, or null for no expiry` });
      }
      const link = await access.createLink(id, linkRole, expiresInDays, identity.id);
      return send(res, 201, { ...link, path: `/s/${link.token}` });
    }
    if (rest.length === 2 && req.method === 'DELETE') {
      if (!(await access.revokeLink(id, key, identity.id))) return send(res, 404, { error: 'Link not found' });
      await ctx.events.publish('access', id);
      return send(res, 204, '');
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (kind === 'invites' && (rest.length === 1 || rest.length === 2)) {
    if (!allowed('owner')) return;
    if (rest.length === 1 && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const email = normalizeEmail(body.email);
      if (!email) return send(res, 400, { error: 'Enter a valid email address' });
      if (!isGrantRole(body.role)) return send(res, 400, { error: "role must be 'viewer' or 'editor'" });
      const result = await access.invite(id, email, body.role, identity.id);
      if (result === 'owner') return send(res, 400, { error: 'The owner already has full access' });
      if (result === 'granted') await ctx.events.publish('access', id);
      return send(res, 200, { result, access: await current() });
    }
    if (rest.length === 2 && req.method === 'DELETE') {
      const email = normalizeEmail(key);
      if (!email || !(await access.removeInvite(id, email, identity.id))) return send(res, 404, { error: 'Invitation not found' });
      return send(res, 204, '');
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (kind === 'log' && rest.length === 1 && req.method === 'GET') {
    if (!allowed('owner')) return;
    return send(res, 200, await access.log(id));
  }

  return send(res, 404, { error: 'Not found' });
}

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

/**
 * DELETE /api/projects/:id  (owner only)
 *   no body                                   soft delete: hidden everywhere, kept in the database
 *   { permanent: true, confirmName: <name> }  permanent delete; confirmName must repeat the project name
 * Everyone with the project open is told at once (`access` event); running chat turns stop.
 */
async function deleteProject(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  allowed: (minimum: Role, ownerOnly?: string) => boolean
): Promise<void> {
  if (!allowed('owner', 'Only the owner can delete this project')) return;
  const body = await readJson(req, 4096);
  if (body.permanent !== undefined && typeof body.permanent !== 'boolean') return send(res, 400, { error: 'permanent must be true or false' });
  let result;
  if (body.permanent) {
    // a leaked token may hide a project (an admin can restore it), but never destroy it
    if (ctx.viaToken) return send(res, 403, { error: 'Delete projects permanently in the app, not with a token' });
    const name = (await ctx.store.readMeta(id)).name || id;
    if (body.confirmName !== name) return send(res, 400, { error: 'Type the project name exactly to delete it permanently' });
    result = await ctx.store.purgeProject(id, ctx.identity.id);
  } else {
    result = await ctx.store.deleteProject(id, ctx.identity.id);
  }
  if (!result) return send(res, 404, { error: 'Project not found' });
  await ctx.events.publish('access', id); // open editors get the "deleted" notice
  for (const conversationId of result.stopConversations) await ctx.events.publish('chat', conversationId);
  return send(res, 204, '');
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
  if (resource === 'users' && parts.length === 2 && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return send(res, 200, []);
    return send(res, 200, await ctx.access.searchUsers(q.slice(0, 100)));
  }
  if (resource === 'share' && parts[2] === 'join' && parts.length === 3 && req.method === 'POST') {
    // joining needs a browser session: the link is for people, not for scripts with a token
    if (ctx.viaToken) return send(res, 403, { error: 'Open share links in the browser' });
    const { token } = await readJson(req, 4096);
    const result = await ctx.access.joinByLink(String(token ?? ''), identity.id);
    if (result === 'invalid') return send(res, 404, { error: 'This share link is not valid. It may have been revoked.' });
    if (result === 'expired') return send(res, 410, { error: 'This share link has expired. Ask the owner for a new one.' });
    if (result === 'deleted') return send(res, 410, { error: 'The project this link points to was deleted by its owner.', reason: 'deleted' });
    await ctx.events.publish('access', result.documentId); // the user's open tabs on the project get the raised role
    return send(res, 200, { projectId: result.documentId, role: result.role });
  }
  if (resource !== 'projects') return send(res, 404, { error: 'Not found' });

  if (!id) {
    if (req.method === 'GET') return send(res, 200, await store.listProjects(identity.id));
    if (req.method === 'POST') {
      const body = await readJson(req, MAX_BODY);
      if (body.xml && !looksLikeBpmn(body.xml)) return send(res, 400, { error: 'Not a BPMN file' });
      const newId = await store.createProject(String(body.name || 'Untitled diagram').trim().slice(0, 200), body.xml, identity.name, identity.id);
      return send(res, 201, { id: newId });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  // Every project route needs at least the viewer role; without it the project does not exist for this user.
  const role = isProjectId(id) ? await ctx.access.roleOf(identity.id, id) : 'none';
  if (role === 'none') return send(res, 404, { error: 'Project not found' });
  const allowed = (minimum: Role, ownerOnly = 'Only the owner can change who has access'): boolean => {
    if (atLeast(role, minimum)) return true;
    send(res, 403, { error: minimum === 'owner' ? ownerOnly : 'You can view this project but not change it' });
    return false;
  };

  if (!sub && req.method === 'DELETE') return deleteProject(ctx, req, res, id, allowed);

  if (!sub) {
    if (req.method === 'GET') {
      const [meta, xml, version, access] = await Promise.all([store.readMeta(id), store.readLatest(id), store.currentVersion(id), ctx.access.access(id)]);
      // unsaved changes shared by people currently editing take precedence over the saved file
      const shared = live.liveDoc(id);
      return send(res, 200, {
        id,
        name: meta.name || id,
        version,
        xml: shared ? shared.xml : xml,
        rev: shared ? shared.rev : 0,
        dirty: shared ? shared.dirty : false,
        role,
        visibility: access.visibility,
        owner: access.owner && { id: access.owner.id, name: access.owner.name }
      });
    }
    if (req.method !== 'PUT' && req.method !== 'PATCH') return send(res, 405, { error: 'Method not allowed' });
    if (!allowed('editor')) return;
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
    if (req.method === 'GET') return live.handleStream(req, res, id, url, { id: identity.id, name: identity.name, role });
    if (req.method === 'POST') {
      const body = await readJson(req, MAX_BODY);
      // viewers share their cursor and presence, but not diagram changes
      if (body.type === 'doc' && !allowed('editor')) return;
      const result = live.handlePost(id, body);
      return send(res, result.status, result.body);
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (sub === 'access') return handleAccess(ctx, req, res, id, parts.slice(4), role, allowed);

  if (sub === 'chat') {
    if (!ctx.agentChat) return send(res, 404, { error: 'Chat is disabled on this server' });
    return handleAgentChat(ctx.agentChat, { identity, viaToken: ctx.viaToken, upstreamToken: ctx.upstreamToken }, req, res, id, parts.slice(4));
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
