// The tools the AI assistant can call. Browser tools run in the user's open editor (through
// bpmn-js, so edits are undoable and reach live collaborators); the server only describes them,
// forwards the calls as `tool_request` events and waits for the browser's answer.
//
// Each tool names the minimum role it needs. The agent loop offers only the tools the user's
// current role allows, and checks again when the model calls one.

import type { Role } from '../storage/accessStore.ts';
import { atLeast } from '../storage/accessStore.ts';
import type { ToolSpec } from '../llm/types.ts';

export interface BrowserTool extends ToolSpec {
  minRole: Extract<Role, 'viewer' | 'editor'>;
}

const ids = (description: string) => ({ type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 200, description });

const elementSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Readable unique id, e.g. Activity_CheckOrder' },
    type: { type: 'string', description: 'BPMN type, e.g. bpmn:Task, bpmn:ExclusiveGateway, bpmn:EndEvent' },
    name: { type: 'string' },
    parent: { type: 'string', description: 'Id of the process, participant, lane or subprocess to place it in' },
    x: { type: 'number' },
    y: { type: 'number' },
    properties: { type: 'object', description: 'Further BPMN attributes to set' }
  },
  required: ['type'],
  additionalProperties: false
};

export const BROWSER_TOOLS: BrowserTool[] = [
  {
    name: 'bpmn_get_summary',
    minRole: 'viewer',
    description: 'Overview of the diagram open in the editor (including unsaved changes): processes, element counts, '
      + 'and an index of all elements with id, type, name, incoming and outgoing flows. Call this before anything else.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bpmn_get_elements',
    minRole: 'viewer',
    description: 'All properties of the given elements.',
    inputSchema: { type: 'object', properties: { ids: ids('Element ids') }, required: ['ids'], additionalProperties: false }
  },
  {
    name: 'bpmn_get_xml',
    minRole: 'viewer',
    description: 'The complete BPMN 2.0 XML of the diagram as currently shown in the editor. Large; prefer the summary.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bpmn_lint',
    minRole: 'viewer',
    description: 'Checks the diagram with bpmnlint and returns the problems found.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bpmn_export_svg',
    minRole: 'viewer',
    description: 'The diagram rendered as SVG, to check the layout visually.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bpmn_add_elements',
    minRole: 'editor',
    description: 'Adds flow nodes, data objects, lanes or participants. Positions are optional; '
      + 'connect them afterwards with bpmn_connect.',
    inputSchema: {
      type: 'object',
      properties: { elements: { type: 'array', items: elementSchema, minItems: 1, maxItems: 100 } },
      required: ['elements'],
      additionalProperties: false
    }
  },
  {
    name: 'bpmn_update_elements',
    minRole: 'editor',
    description: 'Changes names or other properties of existing elements, or moves them.',
    inputSchema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              properties: { type: 'object' }
            },
            required: ['id'],
            additionalProperties: false
          }
        }
      },
      required: ['updates'],
      additionalProperties: false
    }
  },
  {
    name: 'bpmn_delete_elements',
    minRole: 'editor',
    description: 'Removes elements; their connections are removed too.',
    inputSchema: { type: 'object', properties: { ids: ids('Element ids to remove') }, required: ['ids'], additionalProperties: false }
  },
  {
    name: 'bpmn_connect',
    minRole: 'editor',
    description: 'Connects elements with sequence flows (default), message flows or associations.',
    inputSchema: {
      type: 'object',
      properties: {
        connections: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string', enum: ['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association'] },
              id: { type: 'string' },
              name: { type: 'string', description: 'Label, e.g. the condition after a gateway' }
            },
            required: ['source', 'target'],
            additionalProperties: false
          }
        }
      },
      required: ['connections'],
      additionalProperties: false
    }
  },
  {
    name: 'bpmn_replace_xml',
    minRole: 'editor',
    description: 'Replaces the whole diagram with new BPMN 2.0 XML (including diagram interchange). '
      + 'Only for large rewrites; prefer the element tools.',
    inputSchema: { type: 'object', properties: { xml: { type: 'string' } }, required: ['xml'], additionalProperties: false }
  },
  {
    name: 'bpmn_auto_layout',
    minRole: 'editor',
    description: 'Lays out the whole diagram automatically, left to right (diagrams without pools and lanes).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bpmn_summarize_changes',
    minRole: 'editor',
    description: 'Records what you changed in this turn, for the version history. Call it once, after your last edit. '
      + 'Write correct, plain English regardless of how the request was phrased; describe the diagram, not the conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 80, description: 'Short imperative summary, e.g. "Add review step before shipping"' },
        details: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string', maxLength: 160 },
          description: 'A few concise points, e.g. "Add task Review order between Pack order and Ship order"'
        }
      },
      required: ['title', 'details'],
      additionalProperties: false
    }
  }
];

const BY_NAME = new Map(BROWSER_TOOLS.map((tool) => [tool.name, tool]));

export const findTool = (name: string): BrowserTool | undefined => BY_NAME.get(name);

/** The tools a user with this role may use, as sent to the model. */
export function toolsForRole(role: Role): ToolSpec[] {
  return BROWSER_TOOLS
    .filter((tool) => atLeast(role, tool.minRole))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/** Why the user may not call this tool now, or null when they may. */
export function toolRefusal(name: string, role: Role): string | null {
  const tool = findTool(name);
  if (!tool) return `Unknown tool: ${name}`;
  if (!atLeast(role, tool.minRole)) return `${name} needs edit access; the user can only view this diagram`;
  return null;
}
