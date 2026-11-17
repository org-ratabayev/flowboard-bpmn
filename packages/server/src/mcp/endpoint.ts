// The MCP server endpoint, POST /mcp (section 8 of docs/redesign-plan.md): the official SDK's
// streamable HTTP handler, stateless, so any server instance can answer any request. Checks the
// Origin and the caller (mcpAuth.ts) before the SDK sees the request; the tools come from tools.ts
// and get a fresh server per request.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Auth } from '../auth/index.ts';
import { isSameOrigin, isSecure } from '../auth/requestChecks.ts';
import type { TokenStore } from '../auth/tokenStore.ts';
import { send } from '../http.ts';
import type { LiveHub } from '../live.ts';
import type { AccessStore } from '../storage/accessStore.ts';
import type { DocumentStore } from '../storage/index.ts';
import { identifyMcpCaller, type McpCaller } from './mcpAuth.ts';
import { sendWebResponse, toWebRequest } from './nodeBridge.ts';
import { createToolServer } from './tools.ts';

/** Request body cap, also the SDK default: diagrams above this size take too long to parse in one request. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface McpEndpointDeps {
  store: DocumentStore;
  access: AccessStore;
  live: LiveHub;
  auth: Auth;
  tokens: TokenStore;
  publicOrigin: string | undefined;
  /** MCP_PROXY_AUTH: accept the trusted proxy's identity with a non-PAT bearer (mcpAuth.ts). */
  proxyAuth: boolean;
  /** Headers that carry credentials besides Authorization and Cookie (proxy secret, upstream token); not passed to the SDK. */
  secretHeaders: string[];
}

export type McpEndpoint = ReturnType<typeof createMcpEndpoint>;

export function createMcpEndpoint(deps: McpEndpointDeps) {
  const secretHeaders = ['authorization', 'cookie', ...deps.secretHeaders.map((h) => h.toLowerCase())];
  // the caller travels to the factory as SDK auth info; the bearer itself is not passed on
  const handler = createMcpHandler((ctx) => {
    const extra = ctx.authInfo?.extra as { caller: McpCaller; origin: string } | undefined;
    if (!extra) throw new Error('MCP request without a caller');
    return createToolServer({ store: deps.store, access: deps.access, live: deps.live, caller: extra.caller, origin: extra.origin });
  }, {
    legacy: 'stateless',
    maxRequestBodySize: MAX_BODY_BYTES,
    onerror: (err) => console.error('MCP request failed:', err.message)
  });

  /**
   * Origin for editor links: PUBLIC_ORIGIN, otherwise the Host the client used (only shapes that client's own
   * links; behind a proxy that terminates TLS they come out as http:// unless PUBLIC_ORIGIN is set).
   */
  function originOf(req: IncomingMessage): string {
    if (deps.publicOrigin) return deps.publicOrigin;
    try {
      return new URL(`${isSecure(req, undefined) ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`).origin;
    } catch {
      return 'http://localhost';
    }
  }

  return {
    // POST /mcp   one JSON-RPC message (GET and DELETE are session operations a stateless server does not have)
    async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
      // No Origin: not a browser. With one, it must be this app, so pages on other sites are refused. Without
      // PUBLIC_ORIGIN the check compares with Host, which a DNS-rebinding page controls as well; there the
      // bearer requirement is what protects (such a page cannot know a token), and PUBLIC_ORIGIN makes it strict.
      if (req.headers.origin !== undefined && !isSameOrigin(req, deps.publicOrigin)) {
        return send(res, 403, { error: 'Cross-site request refused' });
      }
      const caller = await identifyMcpCaller(req, deps.auth, deps.tokens, deps.proxyAuth);
      if (!caller) {
        return send(res, 401, { error: 'Sign in with a personal access token: Authorization: Bearer fb_pat_…' }, { 'WWW-Authenticate': 'Bearer' });
      }
      if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
        // answer before the body is sent, then close: reading it would only waste time
        return send(res, 413, { error: 'Payload too large' }, { Connection: 'close' });
      }
      const origin = originOf(req);
      const closed = new AbortController();
      res.on('close', () => closed.abort());
      const url = new URL(req.url || '/mcp', origin);
      const request = await toWebRequest(req, url, { maxBytes: MAX_BODY_BYTES, signal: closed.signal, dropHeaders: secretHeaders });
      const response = await handler.fetch(request, { authInfo: { token: '', clientId: caller.via, scopes: [], extra: { caller, origin } } });
      await sendWebResponse(res, response);
    },
    close: () => handler.close()
  };
}
