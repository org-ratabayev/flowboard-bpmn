// Who is calling /mcp (decision 7 of phase 7 in docs/redesign-plan.md). Only bearer requests count,
// so cookies never authenticate here and another site cannot drive /mcp through a signed-in browser:
//   Bearer fb_pat_…   a personal access token, in every auth mode (an invalid one is never rescued)
//   any other Bearer  only with MCP_PROXY_AUTH=on (which needs AUTH=trusted-headers): the verified
//                     proxy's identity headers decide; the bearer is the proxy's own, which the proxy
//                     must validate on every /mcp request; here it only shows that this is a client,
//                     not a cookie-driven browser, and is never checked, stored or logged
// REST keeps its own rule (a non-PAT bearer is a 401 there).

import type { IncomingMessage } from 'node:http';
import type { Auth, Identity } from '../auth/index.ts';
import type { TokenStore } from '../auth/tokenStore.ts';

/** Anything that looks like a personal access token, in any letter case, is judged as one (a typo gets a 401). */
const PAT_SHAPED = /^fb_pat_/i;

/**
 * A signed-in MCP client. Every MCP caller is treated like an access-token caller on REST
 * (`viaToken`): no token management, no AI keys, no joining share links, no deleting. MCP never
 * deletes, whatever way the caller signed in, so there is simply no tool for those actions;
 * `via` is kept for rules that may differ by sign-in later.
 */
export interface McpCaller {
  user: Identity;
  via: 'token' | 'proxy';
}

export async function identifyMcpCaller(req: IncomingMessage, auth: Auth, tokens: TokenStore, proxyAuth: boolean): Promise<McpCaller | null> {
  const header = req.headers.authorization;
  const bearer = header === undefined ? null : /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!bearer) return null;
  if (PAT_SHAPED.test(bearer)) {
    const user = await tokens.userForToken(bearer);
    return user && { user, via: 'token' };
  }
  // with trusted-headers, identify() checks the proxy secret / address and reads only the identity
  // headers (this mode has no sessions); other modes would fall back to the cookie, so never call it there
  // (the config refuses proxyAuth without trusted-headers; checked again here)
  if (!proxyAuth || auth.kind !== 'trusted-headers') return null;
  const user = await auth.identify(req);
  return user && { user, via: 'proxy' };
}
