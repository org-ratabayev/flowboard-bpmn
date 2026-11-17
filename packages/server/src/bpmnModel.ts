// Server-side BPMN parsing with bpmn-moddle: strict validation and a compact summary.
// Used by the MCP tools (create / update / restore reject bad XML; get_diagram_summary). REST saves keep the cheap
// regex check `looksLikeBpmn` in bpmn.ts. Pure functions: no file or network access (the XML parser does not
// resolve external entities or schemas).
import { BpmnModdle } from 'bpmn-moddle';

const MAX_XML_BYTES = 20 * 1024 * 1024; // same cap as REST saves
const MAX_PROBLEMS = 20;

/** The slice of a moddle element that this module reads. */
export interface ModdleElement {
  $type: string;
  $instanceOf(type: string): boolean;
  id?: string;
  name?: string;
  [key: string]: unknown;
}
export type Definitions = ModdleElement;

export type ValidationResult = { ok: true; definitions: Definitions } | { ok: false; problems: string[] };

const list = (value: unknown): ModdleElement[] => (Array.isArray(value) ? (value as ModdleElement[]) : []);
const ref = (value: unknown): string | undefined => (value as ModdleElement | undefined)?.id;
const typeName = (el: ModdleElement) => el.$type.replace(/^bpmn:/, '');

/** Parses the XML; `warnings` are import warnings (unknown elements, unresolved references, ...). */
async function parse(xml: string): Promise<{ definitions: Definitions; warnings: string[] } | { error: string }> {
  try {
    const { rootElement, warnings } = await new BpmnModdle().fromXML(xml, 'bpmn:Definitions');
    return { definitions: rootElement as Definitions, warnings: warnings.map((w) => w.message) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Visits the lanes (parents before children) and flow elements of a process, recursing into sub-processes. */
function walkProcess(process: ModdleElement, visit: (el: ModdleElement) => void) {
  const lanes = (laneSet: ModdleElement | undefined) => {
    for (const lane of list(laneSet?.lanes)) {
      visit(lane);
      lanes(lane.childLaneSet as ModdleElement | undefined);
    }
  };
  const flowElements = (container: ModdleElement) => {
    for (const el of list(container.flowElements)) {
      visit(el);
      if (el.$instanceOf('bpmn:SubProcess')) flowElements(el);
    }
  };
  for (const set of list(process.laneSets)) lanes(set);
  flowElements(process);
}

/** Ids of every element that has a BPMNShape or BPMNEdge, in any diagram (collapsed sub-processes may use their own). */
function drawnIds(definitions: Definitions): Set<string> {
  const ids = new Set<string>();
  for (const diagram of list(definitions.diagrams)) {
    for (const item of list((diagram.plane as ModdleElement | undefined)?.planeElement)) {
      const id = ref(item.bpmnElement);
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Elements that must be drawn: participants, lanes, flow nodes (events incl. boundary events, tasks, gateways,
 * sub-processes, call activities) get a BPMNShape; sequence flows and message flows get a BPMNEdge. Data objects,
 * annotations, associations and groups are optional, so they are not checked.
 */
function mustBeDrawn(definitions: Definitions): { el: ModdleElement; kind: 'BPMNShape' | 'BPMNEdge' }[] {
  const out: { el: ModdleElement; kind: 'BPMNShape' | 'BPMNEdge' }[] = [];
  const add = (el: ModdleElement) => {
    if (el.$instanceOf('bpmn:SequenceFlow') || el.$instanceOf('bpmn:MessageFlow')) out.push({ el, kind: 'BPMNEdge' });
    else if (el.$instanceOf('bpmn:FlowNode') || el.$instanceOf('bpmn:Lane') || el.$instanceOf('bpmn:Participant')) out.push({ el, kind: 'BPMNShape' });
  };
  for (const root of list(definitions.rootElements)) {
    if (root.$instanceOf('bpmn:Collaboration')) [...list(root.participants), ...list(root.messageFlows)].forEach(add);
    else if (root.$instanceOf('bpmn:Process')) walkProcess(root, add);
  }
  return out;
}

/** Strict check for MCP writes: the XML must parse without warnings and every flow node and flow must be drawn. */
export async function validateBpmn(xml: string): Promise<ValidationResult> {
  if (typeof xml !== 'string' || !xml.trim()) return { ok: false, problems: ['The XML is empty'] };
  if (Buffer.byteLength(xml) > MAX_XML_BYTES) return { ok: false, problems: ['The diagram is larger than 20 MB'] };
  const parsed = await parse(xml);
  if ('error' in parsed) return { ok: false, problems: [`The XML does not parse: ${parsed.error}`] };

  const { definitions } = parsed;
  const problems = parsed.warnings.map((w) => `Import warning: ${w}`);
  if (!list(definitions.diagrams).length) {
    problems.push('The diagram has no bpmndi:BPMNDiagram; every flow node needs a BPMNShape and every sequence flow a BPMNEdge');
  } else {
    const drawn = drawnIds(definitions);
    for (const { el, kind } of mustBeDrawn(definitions)) {
      if (!el.id || !drawn.has(el.id)) problems.push(`${typeName(el)} "${el.id ?? '?'}" has no ${kind} in the diagram`);
    }
  }
  if (problems.length > MAX_PROBLEMS) {
    const more = problems.length - MAX_PROBLEMS;
    problems.length = MAX_PROBLEMS;
    problems.push(`... and ${more} more problems`);
  }
  return problems.length ? { ok: false, problems } : { ok: true, definitions };
}

/**
 * Compact overview of a diagram: ids, types, names, lanes and connections only. No layout and no documentation
 * text, so it is far smaller than the XML. Empty fields are left out.
 */
export interface BpmnSummary {
  processes: { id: string; name?: string; participant?: string }[];
  /** Pools; `process` is the process it runs (absent for collapsed black-box pools). */
  participants: { id: string; name?: string; process?: string }[];
  lanes: { id: string; name?: string; process: string }[];
  /** Flow nodes of all processes and sub-processes; `lane` is the innermost lane, `parent` the enclosing sub-process. */
  nodes: { id: string; type: string; name?: string; process: string; lane?: string; parent?: string }[];
  /** `condition`: the flow has a condition expression; `default`: it is the default flow of its source. */
  flows: { id: string; source?: string; target?: string; name?: string; condition?: true; default?: true }[];
  messageFlows: { id: string; source?: string; target?: string; name?: string }[];
  counts: { nodes: number; flows: number; lanes: number };
}

const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

export function summarizeDefinitions(definitions: Definitions): BpmnSummary {
  const summary: BpmnSummary = { processes: [], participants: [], lanes: [], nodes: [], flows: [], messageFlows: [], counts: { nodes: 0, flows: 0, lanes: 0 } };
  const roots = list(definitions.rootElements);
  const participantOf = new Map<string, string>();
  for (const collab of roots.filter((r) => r.$instanceOf('bpmn:Collaboration'))) {
    for (const p of list(collab.participants)) {
      const process = ref(p.processRef);
      if (process) participantOf.set(process, p.id!);
      summary.participants.push(compact({ id: p.id!, name: p.name, process }));
    }
    for (const m of list(collab.messageFlows)) {
      summary.messageFlows.push(compact({ id: m.id!, source: ref(m.sourceRef), target: ref(m.targetRef), name: m.name }));
    }
  }
  for (const process of roots.filter((r) => r.$instanceOf('bpmn:Process'))) {
    const pid = process.id!;
    summary.processes.push(compact({ id: pid, name: process.name, participant: participantOf.get(pid) }));
    // Lanes are visited parents first, so the innermost lane wins in laneOf.
    const laneOf = new Map<string, string>();
    const parentOf = new Map<string, string>();
    walkProcess(process, (el) => {
      if (el.$instanceOf('bpmn:Lane')) {
        summary.lanes.push(compact({ id: el.id!, name: el.name, process: pid }));
        for (const n of list(el.flowNodeRef)) laneOf.set(n.id!, el.id!);
      } else if (el.$instanceOf('bpmn:SubProcess')) {
        for (const child of list(el.flowElements)) parentOf.set(child.id!, el.id!);
      }
    });
    walkProcess(process, (el) => {
      if (el.$instanceOf('bpmn:SequenceFlow')) {
        const isDefault = ref((el.sourceRef as ModdleElement | undefined)?.default) === el.id;
        summary.flows.push(compact({
          id: el.id!, source: ref(el.sourceRef), target: ref(el.targetRef), name: el.name,
          condition: el.conditionExpression ? (true as const) : undefined,
          default: isDefault ? (true as const) : undefined,
        }));
      } else if (el.$instanceOf('bpmn:FlowNode')) {
        summary.nodes.push(compact({ id: el.id!, type: typeName(el), name: el.name, process: pid, lane: laneOf.get(el.id!), parent: parentOf.get(el.id!) }));
      }
    });
  }
  summary.counts = { nodes: summary.nodes.length, flows: summary.flows.length, lanes: summary.lanes.length };
  return summary;
}

/** Summary straight from XML. Parse errors come back as `problems`; import warnings are ignored here. */
export async function summarizeBpmn(xml: string): Promise<{ ok: true; summary: BpmnSummary } | { ok: false; problems: string[] }> {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_XML_BYTES) return { ok: false, problems: ['The XML is missing or larger than 20 MB'] };
  const parsed = await parse(xml);
  if ('error' in parsed) return { ok: false, problems: [`The XML does not parse: ${parsed.error}`] };
  return { ok: true, summary: summarizeDefinitions(parsed.definitions) };
}
