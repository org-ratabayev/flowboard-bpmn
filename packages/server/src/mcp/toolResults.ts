// Results and errors of MCP tools. Invalid arguments are answered by the SDK, a ToolError is shown to
// the client, anything else is logged and reported as "Internal error" (like a 500 on REST: database
// details never reach the client).

import type { CallToolResult } from '@modelcontextprotocol/server';

/** An expected failure whose message the MCP client may see (for example "Diagram not found"). */
export class ToolError extends Error {}

const errorResult = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });

/** Structured content, repeated as JSON text for clients that only read text. */
export function jsonResult(result: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}

/** Wraps a tool handler so that only ToolError messages reach the client. */
export function guarded<A>(tool: string, run: (args: A) => Promise<CallToolResult>): (args: A) => Promise<CallToolResult> {
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
