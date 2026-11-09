// createServer: builds the HTTP server from the configuration. Checks the Origin of state-changing
// requests (CSRF), authenticates every request (access token or session), routes to /auth, the
// pages, static files, /api/llm and /api, and wires storage, events, AI providers and chat on start.

import fsp from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createAgentChat, type AgentChat } from './chat/agentRoutes.ts';
import { parseConfig, type Config, type ConfigInput } from './config.ts';
import { HttpError, send, serveStatic } from './http.ts';
import { createLiveHub } from './live.ts';
import { createAuth, type Auth, type Identity } from './auth/index.ts';
import { createAuthStore } from './auth/authStore.ts';
import { isSameOrigin } from './auth/requestChecks.ts';
import { createTokenStore, type TokenStore } from './auth/tokenStore.ts';
import { createAccessStore, type AccessStore } from './storage/accessStore.ts';
import { createLocalEvents, createPostgresEvents, type EventBus } from './events.ts';
import { resolveAppSecret } from './appSecret.ts';
import { createCatalog } from './llm/catalog.ts';
import { claudeCodeEntry } from './llm/claudeCodeCli.ts';
import { createKeyStore } from './llm/keyStore.ts';
import { forgetKeyring, handleLlm, type LlmContext } from './llm/routes.ts';
import { handleApi, type ApiContext } from './routes.ts';
import { importFromFolder, openStore, type DocumentStore, type ImportResult } from './storage/index.ts';

export interface BpmnServer {
  config: Config;
  httpServer: http.Server;
  /**
   * Opens the database (applying migrations and, on first start, importing project folders
   * from dataDir), then listens on config.host/config.port; resolves with the actual address.
   */
  listen(): Promise<{ host: string; port: number }>;
  /** Stops accepting requests, closes open connections (including live streams) and the database. */
  close(): Promise<void>;
  /** Projects imported from dataDir during listen(), if any. */
  imported: ImportResult[];
  /** Where APP_SECRET came from, when users can save their own AI keys (to warn about a generated one). */
  appSecretSource: 'env' | 'file' | 'generated' | null;
}

export function createServer(input: Config | ConfigInput): BpmnServer {
  const config = parseConfig(input);
  const publicDir = config.publicDir;
  let store: DocumentStore | null = null;
  let auth: Auth | null = null;
  let tokens: TokenStore | null = null;
  let access: AccessStore | null = null;
  let events: EventBus | null = null;
  let llm: LlmContext | null = null;
  let agentChat: AgentChat | null = null;
  const ctx: Omit<ApiContext, 'store' | 'identity' | 'auth' | 'tokens' | 'access' | 'events' | 'viaToken' | 'agentChat' | 'upstreamToken'> = {
    live: createLiveHub()
  };

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const isApi = parts[0] === 'api';
      // API clients authenticate with a token header, which other sites cannot make a browser send,
      // so the cross-site check applies only to cookie-based requests.
      // Any Authorization header counts as a token attempt; a malformed one is simply an invalid token.
      const bearer = req.headers.authorization === undefined ? null : (/^Bearer\s+(\S+)$/i.exec(req.headers.authorization)?.[1] ?? '');
      const changesData = !['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET');
      if (changesData && !(isApi && bearer) && (isApi || parts[0] === 'auth') && !isSameOrigin(req, config.publicOrigin)) {
        return send(res, 403, { error: 'Cross-site request refused' });
      }
      if (parts[0] === 'auth') {
        if (req.method === 'POST' && parts.join('/') === 'auth/logout') await forgetKeyring(llm?.keys ?? null, req, res, config.publicOrigin);
        if (await auth!.handle(req, res, parts)) return;
        return send(res, 404, 'Not found');
      }

      const isPublic = parts[0] === 'assets' || (parts.length === 1 && ['licenses', 'favicon.ico', 'login.html'].includes(parts[0]));
      let identity: Identity | null = null;
      const viaToken = isApi && bearer !== null;
      if (!isPublic) {
        // a token, when sent, is the only credential considered: an invalid one is never rescued by a cookie
        identity = viaToken ? await tokens!.userForToken(bearer!) : await auth!.identify(req);
        if (!identity) {
          const isPage = req.method === 'GET' && (parts.length === 0 || (parts.length === 1 && parts[0] === 'settings') || ((parts[0] === 'p' || parts[0] === 's') && parts.length === 2));
          if (isPage) {
            res.writeHead(302, { Location: `/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`, 'Cache-Control': 'no-store' });
            return res.end();
          }
          return send(res, 401, isApi ? { error: 'unauthorized', loginUrl: '/auth/login' } : 'Unauthorized');
        }
      }

      if (isApi && parts[1] === 'llm') {
        return await handleLlm(llm!, { user: identity!, upstreamToken: viaToken ? null : auth!.upstreamToken(req), viaToken }, req, res, parts.slice(2));
      }
      if (isApi) {
        return await handleApi({
          ...ctx,
          store: store!, identity: identity!, auth: auth!, tokens: tokens!, access: access!, events: events!, viaToken, agentChat,
          // a token request may pass through a proxy that signed in somebody else: never mix the two
          upstreamToken: viaToken ? null : auth!.upstreamToken(req)
        }, req, res, parts, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      if (parts.length === 0) return await serveStatic(res, path.join(publicDir, 'index.html'));
      if (parts.length === 1 && parts[0] === 'settings') return await serveStatic(res, path.join(publicDir, 'settings.html'));
      if (parts[0] === 's' && parts.length === 2) return await serveStatic(res, path.join(publicDir, 'join.html'));
      if (parts[0] === 'p' && parts.length === 2) return await serveStatic(res, path.join(publicDir, 'editor.html'));
      if (parts[0] === 'licenses' && parts.length === 1 && config.licensesFile) {
        const text = await fsp.readFile(config.licensesFile, 'utf8');
        return send(res, 200, text, { 'Cache-Control': 'no-cache' });
      }
      const file = path.resolve(publicDir, ...parts);
      if (!file.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden');
      return await serveStatic(res, file);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      if (!res.headersSent) send(res, status || 500, { error: status ? (err as Error).message : 'Internal error' });
      if (!status) console.error(err);
    }
  });

  const server: BpmnServer = {
    config,
    httpServer,
    imported: [],
    appSecretSource: null,
    async listen() {
      store = await openStore(config.storage);
      const authStore = createAuthStore(store.db);
      auth = createAuth(config, authStore);
      tokens = createTokenStore(store.db);
      access = createAccessStore(store.db);
      events = config.storage.kind === 'postgres'
        ? createPostgresEvents(store.db, { connectionString: config.storage.postgresUrl!, listen: config.storage.postgresListen })
        : createLocalEvents();
      const accessStore = access;
      // when access to a project changes, everyone connected to it learns their new role at once
      const catalog = createCatalog([
        ...config.llm.providers,
        ...(config.chat.claudeCode.enabled ? [claudeCodeEntry(config.chat.claudeCode, config.chat.workDir)] : [])
      ]);
      if (catalog.entries.some((p) => p.credentials.from === 'user-key')) {
        const { secret, source } = resolveAppSecret(config);
        server.appSecretSource = source;
        llm = { mode: config.llm.mode, catalog, keys: createKeyStore(store.db, secret), publicOrigin: config.publicOrigin };
        await llm.keys!.removeUnused(365);
      } else {
        llm = { mode: config.llm.mode, catalog, keys: null, publicOrigin: config.publicOrigin };
      }
      if (config.chat.enabled && catalog.entries.length) {
        agentChat = createAgentChat({
          db: store.db,
          bus: events,
          access,
          catalog,
          keys: llm.keys,
          systemPromptAppend: config.chat.systemPromptAppend,
          maxActiveTurnsPerUser: config.chat.maxActiveTurnsPerUser,
          turnsPerMinute: config.chat.turnsPerMinute,
          idleDays: config.chat.idleDays,
          limits: { maxIterations: config.chat.maxIterations, toolTimeoutMs: config.chat.toolTimeoutMs, pollMs: 2000 }
        });
        await agentChat.sweep();
      }
      const documents = store;
      events.subscribe('access', (documentId) => {
        (async () => {
          // a deleted project (soft or permanent) closes for everyone, with its own notice
          if (!(await documents.hasProject(documentId))) return ctx.live.projectDeleted(documentId);
          return ctx.live.refreshAccess(documentId, (userId) => accessStore.roleOf(userId, documentId));
        })().catch((err) => console.error('Refreshing live access failed:', err));
      });
      await authStore.deleteExpiredSessions();
      if (config.storage.importOnFirstStart && (await store.countProjects()) === 0) {
        server.imported = await importFromFolder(store, config.dataDir);
      }
      // documents from before sharing existed (or imported while nobody had signed in) get an owner
      await access.adoptUnowned();
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off('error', reject);
          const { address, port } = httpServer.address() as AddressInfo;
          resolve({ host: address, port });
        });
      });
    },
    async close() {
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
          httpServer.closeAllConnections();
        });
      }
      agentChat?.close();
      agentChat = null;
      await events?.close();
      events = null;
      await store?.close();
      store = null;
    }
  };
  return server;
}
