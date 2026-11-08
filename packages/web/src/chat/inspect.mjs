// Read-only views of a diagram for the assistant: an overview (bpmn_get_summary) and the full
// properties of single elements (bpmn_get_elements). Both work on the moddle tree of the
// definitions (modeler.getDefinitions()), so they see unsaved changes and need no rendering.

const MAX_INDEX = 2000;

const round = (n) => Math.round(n);

/** Diagram interchange per element id: shape bounds or edge waypoints, from every plane. */
export function diByElement(definitions) {
  const map = new Map();
  for (const diagram of definitions.diagrams || []) {
    for (const di of diagram.plane?.planeElement || []) {
      if (di.bpmnElement?.id) map.set(di.bpmnElement.id, di);
    }
  }
  return map;
}

/** Every semantic element below the definitions with the id of its container. */
export function walk(definitions) {
  const out = [];
  const visit = (el, parent) => {
    out.push({ el, parent });
    for (const child of el.flowElements || []) visit(child, el.id);
    for (const child of el.artifacts || []) visit(child, el.id);
    for (const set of el.laneSets || []) visitLanes(set, el.id);
    for (const child of el.participants || []) visit(child, el.id);
    for (const child of el.messageFlows || []) visit(child, el.id);
  };
  const visitLanes = (set, parent) => {
    for (const lane of set.lanes || []) {
      out.push({ el: lane, parent });
      if (lane.childLaneSet) visitLanes(lane.childLaneSet, lane.id);
    }
  };
  for (const root of definitions.rootElements || []) {
    if (root.$type === 'bpmn:Process' || root.$type === 'bpmn:Collaboration') visit(root, null);
  }
  return out;
}

const ids = (list) => (list || []).map((x) => x.id);

/** The overview the model starts with. */
export function summarize(definitions) {
  const di = diByElement(definitions);
  const all = walk(definitions);
  const laneOf = new Map();
  for (const { el } of all) {
    if (el.$type === 'bpmn:Lane') for (const node of el.flowNodeRef || []) laneOf.set(node.id, el.id);
  }
  // which participant holds which process
  const participantOf = new Map();
  for (const { el } of all) if (el.$type === 'bpmn:Participant' && el.processRef) participantOf.set(el.processRef.id, el.id);

  const counts = {};
  const elements = [];
  for (const { el, parent } of all) {
    if (el.$type === 'bpmn:Process' || el.$type === 'bpmn:Collaboration') continue;
    counts[el.$type] = (counts[el.$type] || 0) + 1;
    if (elements.length >= MAX_INDEX) continue;
    const entry = { id: el.id, type: el.$type };
    if (el.name) entry.name = el.name;
    entry.parent = participantOf.get(parent) || parent;
    if (laneOf.has(el.id)) entry.lane = laneOf.get(el.id);
    if (el.sourceRef) { entry.source = el.sourceRef.id; entry.target = el.targetRef?.id; }
    if (el.incoming?.length) entry.incoming = ids(el.incoming);
    if (el.outgoing?.length) entry.outgoing = ids(el.outgoing);
    if (el.eventDefinitions?.length) entry.eventDefinitions = el.eventDefinitions.map((d) => d.$type);
    const bounds = di.get(el.id)?.bounds;
    if (bounds) Object.assign(entry, { x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height) });
    elements.push(entry);
  }
  const processes = (definitions.rootElements || [])
    .filter((r) => r.$type === 'bpmn:Process')
    .map((p) => ({ id: p.id, ...(p.name ? { name: p.name } : {}), ...(participantOf.has(p.id) ? { participant: participantOf.get(p.id) } : {}) }));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    processes,
    collaboration: (definitions.rootElements || []).some((r) => r.$type === 'bpmn:Collaboration'),
    counts,
    elements,
    ...(total > elements.length ? { truncated: true } : {})
  };
}

// containment lists replaced by the ids of their members (their details are separate elements)
const CHILD_LISTS = new Set(['flowElements', 'artifacts', 'laneSets', 'participants', 'messageFlows']);

/** A moddle element as plain JSON: references become ids, nested elements are kept (2 levels). */
export function plain(el, depth = 0) {
  const out = { type: el.$type };
  for (const prop of el.$descriptor.properties) {
    const name = prop.name;
    if (name === 'di') continue;
    const value = el.get(name);
    if (value === undefined || value === null || (Array.isArray(value) && !value.length)) continue;
    if (depth === 0 && CHILD_LISTS.has(name)) {
      out[name] = name === 'laneSets' ? value.flatMap((s) => ids(s.lanes)) : ids(value);
    } else if (prop.isReference) {
      out[name] = Array.isArray(value) ? ids(value) : value.id;
    } else if (Array.isArray(value)) {
      if (depth < 2) out[name] = value.map((v) => (v && typeof v === 'object' && v.$type ? plain(v, depth + 1) : v));
    } else if (typeof value === 'object') {
      if (value.$type && depth < 2) out[name] = plain(value, depth + 1);
    } else {
      out[name] = value;
    }
  }
  for (const [key, value] of Object.entries(el.$attrs || {})) {
    if (!key.startsWith('xmlns')) out[key] = value;
  }
  return out;
}

/** Full properties of the given ids; unknown ids are listed separately. */
export function details(definitions, wanted) {
  const di = diByElement(definitions);
  const byId = new Map(walk(definitions).map(({ el }) => [el.id, el]));
  const elements = [];
  const missing = [];
  for (const id of wanted) {
    const el = byId.get(id);
    if (!el) { missing.push(id); continue; }
    const entry = plain(el);
    const shape = di.get(id);
    if (shape?.bounds) entry.bounds = { x: round(shape.bounds.x), y: round(shape.bounds.y), width: round(shape.bounds.width), height: round(shape.bounds.height) };
    if (shape?.waypoint) entry.waypoints = shape.waypoint.map((p) => ({ x: round(p.x), y: round(p.y) }));
    elements.push(entry);
  }
  return missing.length ? { elements, missing } : { elements };
}
