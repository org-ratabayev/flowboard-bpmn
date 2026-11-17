// MCP tools on one diagram (section 8.1 of docs/redesign-plan.md): the read tools. Every call reads
// the caller's role again. Without access (unknown id, deleted project, no role) the answer is "Diagram
// not found", like REST's 404, so ids cannot be probed; a role too low on a diagram the caller can open
// gets a readable refusal, like REST's 403. Diagrams over 4 MB are neither returned nor parsed (the cap
// MCP writes have too): a response carries the XML twice (structured and as text), and parsing larger
// files blocks the server for seconds.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { EMPTY_DIAGRAM } from '../bpmn.ts';
import { summarizeBpmn } from '../bpmnModel.ts';
import { atLeast, type Role } from '../storage/accessStore.ts';
import { isProjectId, isVersionName } from '../storage/index.ts';
import type { ToolContext } from './tools.ts';
import { guarded, jsonResult, ToolError } from './toolResults.ts';

const MAX_DIAGRAM_BYTES = 4 * 1024 * 1024;

const diagramId = z.string().max(100).describe('Diagram id, from list_diagrams');
const versionId = z.string().max(100).describe('Version id, from list_versions');
const includeUnsaved = z.boolean().default(false)
  .describe('Return the unsaved changes of people editing it right now, if any (only those connected to this server instance)');
const readOnly = { readOnlyHint: true, openWorldHint: false };

export function registerProjectTools(server: McpServer, ctx: ToolContext): void {
  const { store, access, live, caller } = ctx;
  const url = (id: string) => `${ctx.origin}/p/${encodeURIComponent(id)}`;

  async function requireRole(id: string, minimum: Role): Promise<Role> {
    const role = isProjectId(id) ? await access.roleOf(caller.user.id, id) : 'none';
    if (role === 'none') throw new ToolError('Diagram not found');
    if (!atLeast(role, minimum)) throw new ToolError(minimum === 'owner' ? 'Only the owner can see who has access' : 'Your role does not allow this');
    return role;
  }

  function checkSize(id: string, xml: string): void {
    const bytes = Buffer.byteLength(xml);
    if (bytes > MAX_DIAGRAM_BYTES) {
      throw new ToolError(`The diagram has ${(bytes / 1048576).toFixed(1)} MB; MCP hands out diagrams up to 4 MB. Open it in the editor: ${url(id)}`);
    }
  }

  async function savedVersion(id: string, version: string) {
    const found = isVersionName(version) ? await store.readVersionDetails(id, version) : null;
    if (!found) throw new ToolError('Version not found');
    return found;
  }

  /** The latest version, or this instance's live draft on top of it with includeUnsaved. */
  async function current(id: string, unsaved: boolean) {
    const latest = await store.readVersionDetails(id, null);
    const draft = unsaved ? live.liveDoc(id) : null;
    const xml = draft?.xml ?? latest?.xml ?? EMPTY_DIAGRAM;
    checkSize(id, xml);
    return { latest, xml, ...(unsaved ? { dirty: draft?.dirty ?? false } : {}) };
  }

  server.registerTool('get_diagram', {
    title: 'Get diagram',
    description: 'BPMN XML of a diagram with its name, your role, the editor link and the saved version it is based on (versionId). '
      + 'With includeUnsaved, unsaved changes shared live by people editing it are included (dirty: true when there are any). '
      + 'Up to 4 MB.',
    inputSchema: z.object({ diagramId, includeUnsaved }),
    annotations: readOnly
  }, guarded('get_diagram', async (args) => {
    const role = await requireRole(args.diagramId, 'viewer');
    const [meta, { latest, xml, ...flags }] = await Promise.all([store.readMeta(args.diagramId), current(args.diagramId, args.includeUnsaved)]);
    return jsonResult({
      id: args.diagramId, name: meta.name || args.diagramId, role, url: url(args.diagramId),
      versionId: latest?.version ?? null, savedAt: latest?.at ?? null, savedBy: latest?.author ?? null, ...flags, xml
    });
  }));

  server.registerTool('get_diagram_summary', {
    title: 'Summarize diagram',
    description: 'Compact structure of a diagram without layout: processes, participants, lanes, flow nodes, sequence and message flows. '
      + 'Cheaper than the full XML. If the saved XML does not parse, returns its problems instead.',
    inputSchema: z.object({ diagramId, includeUnsaved }),
    annotations: readOnly
  }, guarded('get_diagram_summary', async (args) => {
    await requireRole(args.diagramId, 'viewer');
    const { latest, xml, ...flags } = await current(args.diagramId, args.includeUnsaved);
    const summarized = await summarizeBpmn(xml);
    const base = { id: args.diagramId, versionId: latest?.version ?? null, ...flags };
    return jsonResult(summarized.ok ? { ...base, summary: summarized.summary } : { ...base, problems: summarized.problems });
  }));

  server.registerTool('list_versions', {
    title: 'List versions',
    description: 'Saved versions of a diagram, newest first, without XML (get_version reads one).',
    inputSchema: z.object({ diagramId, limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) }),
    annotations: readOnly
  }, guarded('list_versions', async ({ diagramId: id, limit, offset }) => {
    await requireRole(id, 'viewer');
    const page = await store.versionPage(id, limit, offset);
    const versions = page.versions.map((v) => ({ versionId: v.version, createdAt: v.at, author: v.author, source: v.source, note: v.note }));
    return jsonResult({ id, versions, total: page.total, offset, limit });
  }));

  server.registerTool('get_version', {
    title: 'Get version',
    description: 'BPMN XML and details of one saved version of a diagram. Up to 4 MB.',
    inputSchema: z.object({ diagramId, versionId }),
    annotations: readOnly
  }, guarded('get_version', async (args) => {
    await requireRole(args.diagramId, 'viewer');
    const v = await savedVersion(args.diagramId, args.versionId);
    checkSize(args.diagramId, v.xml);
    return jsonResult({ id: args.diagramId, versionId: v.version, createdAt: v.at, author: v.author, source: v.source, note: v.note, xml: v.xml });
  }));

  server.registerTool('export_diagram', {
    title: 'Export diagram',
    description: 'The .bpmn file of a diagram (the latest saved version, or versionId) with a suggested file name. Up to 4 MB. '
      + 'No images: the editor exports SVG.',
    inputSchema: z.object({ diagramId, versionId: versionId.optional() }),
    annotations: readOnly
  }, guarded('export_diagram', async (args) => {
    await requireRole(args.diagramId, 'viewer');
    const v = args.versionId === undefined ? await store.readVersionDetails(args.diagramId, null) : await savedVersion(args.diagramId, args.versionId);
    const xml = v?.xml ?? EMPTY_DIAGRAM;
    checkSize(args.diagramId, xml);
    const fileName = `${args.diagramId}${args.versionId ? `-${args.versionId}` : ''}.bpmn`;
    return jsonResult({ fileName, mimeType: 'application/xml', versionId: v?.version ?? null, content: xml });
  }));

  server.registerTool('list_shares', {
    title: 'List shares',
    description: 'Who has access to a diagram you own: members with their role, share links (no link secrets) and pending invitations. '
      + 'Read-only: access is changed in the app.',
    inputSchema: z.object({ diagramId }),
    annotations: readOnly
  }, guarded('list_shares', async ({ diagramId: id }) => {
    await requireRole(id, 'owner');
    const shares = await access.access(id, { forOwner: true });
    return jsonResult({
      id,
      visibility: shares.visibility,
      owner: shares.owner && { name: shares.owner.name, email: shares.owner.email },
      members: shares.grants.map((g) => ({ name: g.user.name, email: g.user.email, role: g.role, viaLink: g.viaLink, grantedAt: g.grantedAt })),
      links: (shares.links ?? []).map((l) => ({ id: l.id, role: l.role, createdAt: l.createdAt, expiresAt: l.expiresAt, members: l.members })),
      invites: shares.invites ?? []
    });
  }));
}
