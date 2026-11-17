// MCP client helpers for the /mcp tests: connect with the official client and call tools.

import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

/** `modern` pins the 2026-07-28 protocol; the client's default is the 2025 handshake. */
export async function connect(server, headers, { modern = false } = {}) {
  const client = new Client({ name: 'flowboard-test', version: '1.0.0' }, modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), { requestInit: { headers } }));
  return client;
}

/** Calls a tool that must succeed and returns its structured content. */
export async function callOk(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, `${name}: ${JSON.stringify(result)}`);
  return result.structuredContent;
}

/** Calls a tool that must fail and returns its error text. */
export async function callError(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, `${name} should fail: ${JSON.stringify(result).slice(0, 300)}`);
  return result.content.map((c) => c.text).join('\n');
}

/** A personal access token of `name` (dev sign-in). */
export const tokenOf = async (server, name) => (await server.as(name)('POST', '/api/tokens', { name: 'MCP', expiresInDays: 1 })).body.token;
