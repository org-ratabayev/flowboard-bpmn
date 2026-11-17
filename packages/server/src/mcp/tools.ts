// The MCP tools (section 8.1 of docs/redesign-plan.md), registered on a fresh McpServer for every
// request and caller. Tools reuse the stores the REST routes use and read the caller's role on every
// call; projects without access, deleted ones included, look like they do not exist. Errors: invalid
// arguments are answered by the SDK, a ToolError is shown to the client, anything else is logged and
// reported as "Internal error" (like a 500 on REST: database details never reach the client).

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AccessStore } from '../storage/accessStore.ts';
import type { DocumentStore } from '../storage/index.ts';
import type { McpCaller } from './mcpAuth.ts';

export interface ToolContext {
  store: DocumentStore;
  access: AccessStore;
  caller: McpCaller;
  /** PUBLIC_ORIGIN, or the origin the request was sent to; editor links start with it. */
  origin: string;
}

const listInput = z.object({
  scope: z.enum(['mine', 'shared', 'everyone', 'all']).default('all')
    .describe('mine: owned by you; shared: shared with you; everyone: visible to all users; all: every diagram you can open'),
  query: z.string().max(200).optional().describe('Case-insensitive text to find in the name or id'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0)
});

const diagramEntry = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['viewer', 'editor', 'owner']),
  updatedAt: z.string(),
  url: z.string()
});

/** An expected failure whose message the MCP client may see (for example "Diagram not found"). */
export class ToolError extends Error {}

const errorResult = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });

/** Wraps a tool handler so that only ToolError messages reach the client. */
function guarded<A>(tool: string, run: (args: A) => Promise<CallToolResult>): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await run(args);
    } catch (err) {
      if (err instanceof ToolError) return errorResult(err.message);
      console.error(`MCP tool ${tool} failed:`, err);
      return errorResult('Internal error');
    }
  };
}

export function createToolServer(ctx: ToolContext): McpServer {
  // listChanged off: the tool list never changes, so `subscriptions/listen` (2026-07-28 protocol) is
  // acknowledged and closed at once instead of holding a stream open per caller
  const server = new McpServer({ name: 'flowboard', version: '1.0.0' }, { capabilities: { tools: { listChanged: false } } });
  const { store, access, caller } = ctx;

  server.registerTool('list_diagrams', {
    title: 'List diagrams',
    description: 'Lists the BPMN diagrams you can open, most recently changed first, with your role and the editor link.',
    inputSchema: listInput,
    outputSchema: z.object({ diagrams: z.array(diagramEntry), total: z.number(), offset: z.number(), limit: z.number() }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, guarded('list_diagrams', async ({ scope, query, limit, offset }) => {
    const [projects, granted] = await Promise.all([store.listProjects(caller.user.id), access.grantedDocumentIds(caller.user.id)]);
    const needle = query?.trim().toLowerCase() ?? '';
    const matching = projects.filter((p) => {
      const shared = p.role !== 'owner' && granted.has(p.id);
      const inScope = scope === 'all'
        || (scope === 'mine' && p.role === 'owner')
        || (scope === 'shared' && shared)
        || (scope === 'everyone' && p.role !== 'owner' && !shared && p.visibility === 'everyone');
      return inScope && (!needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle));
    });
    const diagrams = matching.slice(offset, offset + limit).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role as 'viewer' | 'editor' | 'owner',
      updatedAt: p.updatedAt,
      url: `${ctx.origin}/p/${encodeURIComponent(p.id)}`
    }));
    const result = { diagrams, total: matching.length, offset, limit };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  }));

  return server;
}
