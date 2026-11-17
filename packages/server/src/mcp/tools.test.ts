// Error handling of the MCP tools: store failures must not reach the client.

import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessStore } from '../storage/accessStore.ts';
import type { DocumentStore } from '../storage/index.ts';
import { createToolServer } from './tools.ts';

async function connect(store: Partial<DocumentStore>, access: Partial<AccessStore>) {
  const server = createToolServer({
    store: store as DocumentStore,
    access: access as AccessStore,
    caller: { user: { id: 'u1', provider: 'dev', subject: 'ann', name: 'Ann', email: null }, via: 'token' },
    origin: 'https://flowboard.example.com'
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

describe('MCP tools', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports an unexpected failure as "Internal error" and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('password authentication failed for user "app" at 10.1.2.3:5432');
    const client = await connect({ listProjects: () => Promise.reject(failure) }, { grantedDocumentIds: async () => new Set() });
    const result = await client.callTool({ name: 'list_diagrams', arguments: {} });
    expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Internal error' }] });
    expect(JSON.stringify(result)).not.toContain('10.1.2.3');
    expect(log).toHaveBeenCalledWith('MCP tool list_diagrams failed:', failure);
  });

  it('keeps argument errors readable', async () => {
    const client = await connect({ listProjects: async () => [] }, { grantedDocumentIds: async () => new Set() });
    const result = await client.callTool({ name: 'list_diagrams', arguments: { limit: 0 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/limit/);
  });

  it('does not offer tool list change notifications', async () => {
    const client = await connect({}, {});
    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false);
  });
});
