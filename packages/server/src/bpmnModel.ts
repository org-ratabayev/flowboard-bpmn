// Server-side BPMN parsing with bpmn-moddle: strict validation and a compact summary.
// Used by the MCP tools (create / update reject bad XML; get_diagram_summary). REST saves keep the cheap
// regex check `looksLikeBpmn` in bpmn.ts. Pure functions that never throw: any failure comes back as problems.
// No file or network access (the XML parser does not resolve external entities or schemas).
import { BpmnModdle } from 'bpmn-moddle';

const MAX_XML_BYTES = 20 * 1024 * 1024; // same cap as REST saves; the MCP tools apply a lower one (see the plan)
const MAX_PROBLEMS = 20;
const MAX_ID_CHARS = 64;
const MAX_WARNING_CHARS = 300;
const PROTOTYPE_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));

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
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const idOf = (el: ModdleElement) => clip(String(el.id ?? '?'), MAX_ID_CHARS);
const message = (err: unknown) => clip(err instanceof Error ? err.message : String(err), MAX_WARNING_CHARS);

/** Parses the XML; `warnings` are import warnings (unknown elements, unresolved references, ...). */
async function parse(xml: string): Promise<{ definitions: Definitions; warnings: string[] } | { error: string }> {
  try {
    const { rootElement, warnings } = await new BpmnModdle().fromXML(xml, 'bpmn:Definitions');
    return { definitions: rootElement as Definitions, warnings: warnings.map((w) => w.message) };
  } catch (err) {
    return { error: message(err) };
  }
}

function warningText(text: string): string {
  const dup = /duplicate ID <(.*?)>/.exec(text);
  const hint = dup && PROTOTYPE_KEYS.has(dup[1]) ? ' (ids must not be JavaScript property names such as constructor)' : '';
  return `Import warning: ${clip(text, MAX_WARNING_CHARS)}${hint}`;
}

/**
 * Visits the lanes (parents before children) and flow elements of a process, including those of nested
 * sub-processes. Iterative, so deeply nested diagrams cannot overflow the stack.
 */
function walkProcess(process: ModdleElement, visit: (el: ModdleElement) => void) {
  const lanes = list(process.laneSets).flatMap((set) => list(set.lanes)).reverse();
  while (lanes.length) {
    const lane = lanes.pop()!;
    visit(lane);
    lanes.push(...[...list((lane.childLaneSet as ModdleElement | undefined)?.lanes)].reverse());
  }
  const stack = [...list(process.flowElements)].reverse();
  while (stack.length) {
    const el = stack.pop()!;
    visit(el);
    if (el.$instanceOf('bpmn:SubProcess')) stack.push(...[...list(el.flowElements)].reverse());
  }
}

/** What each element id is drawn with, in any diagram (collapsed sub-processes may use their own plane). */
function drawing(definitions: Definitions) {
  const shape = new Set<string>(); // BPMNShape with bounds
  const edge = new Set<string>(); // BPMNEdge with at least two waypoints
  const anyShape = new Set<string>();
  const anyEdge = new Set<string>();
  for (const diagram of list(definitions.diagrams)) {
    for (const item of list((diagram.plane as ModdleElement | undefined)?.planeElement)) {
      const id = ref(item.bpmnElement);
      if (!id) continue;
      if (item.$instanceOf('bpmndi:BPMNEdge')) {
        anyEdge.add(id);
        if (list(item.waypoint).length >= 2) edge.add(id);
      } else if (item.$instanceOf('bpmndi:BPMNShape')) {
        anyShape.add(id);
        if (item.bounds) shape.add(id);
      }
    }
  }
  return { shape, edge, anyShape, anyEdge };
}

type Kind = 'BPMNShape' | 'BPMNEdge';

/**
 * Elements that must be drawn: participants, lanes, flow nodes (events incl. boundary events, tasks, gateways,
 * sub-processes, call activities) get a BPMNShape with bounds; sequence flows and message flows get a BPMNEdge with
 * waypoints. Data objects, annotations, associations and groups are optional, so they are not checked.
 */
function mustBeDrawn(definitions: Definitions): { el: ModdleElement; kind: Kind }[] {
  const out: { el: ModdleElement; kind: Kind }[] = [];
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
export async function validateBpmn(xml: unknown): Promise<ValidationResult> {
  if (typeof xml !== 'string' || !xml.trim()) return { ok: false, problems: ['The XML must be a non-empty string'] };
  if (Buffer.byteLength(xml) > MAX_XML_BYTES) return { ok: false, problems: ['The diagram is larger than 20 MB'] };
  try {
    const parsed = await parse(xml);
    if ('error' in parsed) return { ok: false, problems: [`The XML does not parse: ${parsed.error}`] };

    const { definitions } = parsed;
    const problems = parsed.warnings.map(warningText);
    if (!list(definitions.diagrams).length) {
      problems.push('The diagram has no bpmndi:BPMNDiagram; every flow node needs a BPMNShape and every sequence flow a BPMNEdge');
    } else {
      const drawn = drawing(definitions);
      for (const { el, kind } of mustBeDrawn(definitions)) {
        const id = el.id ?? '';
        const isShape = kind === 'BPMNShape';
        if ((isShape ? drawn.shape : drawn.edge).has(id)) continue;
        const what = `${typeName(el)} "${idOf(el)}"`;
        if ((isShape ? drawn.anyShape : drawn.anyEdge).has(id)) {
          problems.push(isShape ? `The BPMNShape of ${what} has no dc:Bounds` : `The BPMNEdge of ${what} needs at least two di:waypoint`);
        } else if ((isShape ? drawn.anyEdge : drawn.anyShape).has(id)) {
          problems.push(`${what} is drawn with a ${isShape ? 'BPMNEdge' : 'BPMNShape'}, it needs a ${kind}`);
        } else {
          problems.push(`${what} has no ${kind} in the diagram`);
        }
      }
    }
    if (problems.length > MAX_PROBLEMS) {
      const more = problems.length - MAX_PROBLEMS;
      problems.length = MAX_PROBLEMS;
      problems.push(`... and ${more} more problems`);
    }
    return problems.length ? { ok: false, problems } : { ok: true, definitions };
  } catch (err) {
    return { ok: false, problems: [`The XML could not be processed: ${message(err)}`] };
  }
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
  /**
   * Flow nodes of all processes and sub-processes. `lane` is the innermost lane, `parent` the enclosing
   * sub-process, `attachedTo` the host of a boundary event, `event` the trigger of an event (`timer`, `message`,
   * `error`, ...; `multiple` when it has several).
   */
  nodes: { id: string; type: string; name?: string; process: string; lane?: string; parent?: string; attachedTo?: string; event?: string }[];
  /** `condition`: the flow has a condition expression; `default`: it is the default flow of its source. */
  flows: { id: string; source?: string; target?: string; name?: string; condition?: true; default?: true }[];
  messageFlows: { id: string; source?: string; target?: string; name?: string }[];
  counts: { nodes: number; flows: number; lanes: number };
  /** Number of import warnings: elements moddle could not read are missing from this summary. */
  warnings?: number;
}

const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

function eventTrigger(el: ModdleElement): string | undefined {
  const defs = list(el.eventDefinitions);
  if (defs.length > 1) return 'multiple';
  const type = defs[0] && typeName(defs[0]).replace(/EventDefinition$/, '');
  return type ? type.charAt(0).toLowerCase() + type.slice(1) : undefined;
}

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
        // Identity comparison: a flow without id must never match a source without default.
        const source = el.sourceRef as ModdleElement | undefined;
        summary.flows.push(compact({
          id: el.id!, source: ref(source), target: ref(el.targetRef), name: el.name,
          condition: el.conditionExpression ? (true as const) : undefined,
          default: source?.default === el ? (true as const) : undefined,
        }));
      } else if (el.$instanceOf('bpmn:FlowNode')) {
        summary.nodes.push(compact({
          id: el.id!, type: typeName(el), name: el.name, process: pid, lane: laneOf.get(el.id!), parent: parentOf.get(el.id!),
          attachedTo: el.$instanceOf('bpmn:BoundaryEvent') ? ref(el.attachedToRef) : undefined,
          event: el.$instanceOf('bpmn:Event') ? eventTrigger(el) : undefined,
        }));
      }
    });
  }
  summary.counts = { nodes: summary.nodes.length, flows: summary.flows.length, lanes: summary.lanes.length };
  return summary;
}

/** Summary straight from XML. Parse errors come back as `problems`; import warnings only set `summary.warnings`. */
export async function summarizeBpmn(xml: unknown): Promise<{ ok: true; summary: BpmnSummary } | { ok: false; problems: string[] }> {
  if (typeof xml !== 'string' || !xml.trim() || Buffer.byteLength(xml) > MAX_XML_BYTES) {
    return { ok: false, problems: ['The XML must be a non-empty string of at most 20 MB'] };
  }
  try {
    const parsed = await parse(xml);
    if ('error' in parsed) return { ok: false, problems: [`The XML does not parse: ${parsed.error}`] };
    const summary = summarizeDefinitions(parsed.definitions);
    if (parsed.warnings.length) summary.warnings = parsed.warnings.length;
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, problems: [`The XML could not be processed: ${message(err)}`] };
  }
}
