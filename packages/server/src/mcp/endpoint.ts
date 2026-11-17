// The MCP server endpoint, POST /mcp (section 8 of docs/redesign-plan.md): the official SDK's
// streamable HTTP handler, stateless, so any server instance can answer any request. Checks the
// Origin (against DNS rebinding) and the caller (mcpAuth.ts) before the SDK sees the request; the
// tools come from tools.ts and get a fresh server per request.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Auth } from '../auth/index.ts';
import { isSameOrigin, isSecure } from '../auth/requestChecks.ts';
import type { TokenStore } from '../auth/tokenStore.ts';
import { send } from '../http.ts';
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
  auth: Auth;
  tokens: TokenStore;
  publicOrigin: string | undefined;
}

export type McpEndpoint = ReturnType<typeof createMcpEndpoint>;

export function createMcpEndpoint(deps: McpEndpointDeps) {
  // the caller travels to the factory as SDK auth info; the bearer itself is not passed on
  const handler = createMcpHandler((ctx) => {
    const extra = ctx.authInfo?.extra as { caller: McpCaller; origin: string } | undefined;
    if (!extra) throw new Error('MCP request without a caller');
    return createToolServer({ store: deps.store, access: deps.access, caller: extra.caller, origin: extra.origin });
  }, {
    legacy: 'stateless',
    maxRequestBodySize: MAX_BODY_BYTES,
    onerror: (err) => console.error('MCP request failed:', err.message)
  });

  /** Origin for editor links: PUBLIC_ORIGIN, otherwise the address the client used. */
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
      // no Origin: not a browser; with one, it must be this app (a page elsewhere must not reach a local server)
      if (req.headers.origin !== undefined && !isSameOrigin(req, deps.publicOrigin)) {
        return send(res, 403, { error: 'Cross-site request refused' });
      }
      const caller = await identifyMcpCaller(req, deps.auth, deps.tokens);
      if (!caller) {
        return send(res, 401, { error: 'Sign in with a personal access token: Authorization: Bearer fb_pat_…' }, { 'WWW-Authenticate': 'Bearer' });
      }
      const origin = originOf(req);
      const closed = new AbortController();
      res.on('close', () => closed.abort());
      const request = await toWebRequest(req, new URL(req.url || '/mcp', origin), MAX_BODY_BYTES, closed.signal);
      const response = await handler.fetch(request, { authInfo: { token: '', clientId: caller.via, scopes: [], extra: { caller, origin } } });
      await sendWebResponse(res, response);
    },
    close: () => handler.close()
  };
}
