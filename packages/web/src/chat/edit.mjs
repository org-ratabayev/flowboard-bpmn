// The assistant's edit tools, applied through bpmn-js `modeling`: every change is a normal
// editor command, so it can be undone and reaches live collaborators like a manual edit.
// Inputs are checked completely before the first change, so a bad call changes nothing.

import { is } from 'bpmn-js/lib/util/ModelUtil';
import { layoutProcess } from 'bpmn-auto-layout';

export class ToolError extends Error {}

const ID_RE = /^[A-Za-z_][\w.-]{0,99}$/;
const PROPERTY_RE = /^[A-Za-z][\w]{0,59}(:[A-Za-z][\w]{0,59})?$/;
const ADDABLE = ['bpmn:FlowNode', 'bpmn:DataObjectReference', 'bpmn:DataStoreReference', 'bpmn:TextAnnotation', 'bpmn:Group', 'bpmn:Participant', 'bpmn:Lane'];
// set through their own input fields or not at all
const RESERVED = new Set(['id', 'name', 'di', 'eventDefinitionType', 'isExpanded', 'flowElements', 'incoming', 'outgoing', 'sourceRef', 'targetRef']);
const GAP = 60;

const services = (modeler) => ({
  registry: modeler.get('elementRegistry'),
  modeling: modeler.get('modeling'),
  elementFactory: modeler.get('elementFactory'),
  bpmnFactory: modeler.get('bpmnFactory'),
  canvas: modeler.get('canvas'),
  moddle: modeler.get('moddle'),
  rules: modeler.get('bpmnRules')
});

function lookup(registry, id) {
  const element = registry.get(id);
  if (!element || element.type === 'label') throw new ToolError(`Unknown element id: ${id}`);
  return element;
}

function checkNewId(s, id, taken) {
  if (id === undefined) return;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new ToolError(`Invalid id "${id}": use letters, digits, _ . - and start with a letter`);
  if (taken.has(id) || s.registry.get(id) || s.moddle.ids?.assigned(id)) throw new ToolError(`The id ${id} is already used`);
  taken.add(id);
}

/** Simple attributes only (text, numbers, booleans), plus documentation and conditions as text. */
function cleanProperties(s, element, properties = {}) {
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) throw new ToolError('properties must be an object');
  const out = {};
  for (const [key, value] of Object.entries(properties)) {
    if (RESERVED.has(key)) continue;
    if (!PROPERTY_RE.test(key)) throw new ToolError(`Invalid property name: ${key}`);
    if (key === 'documentation') {
      out.documentation = value ? [s.moddle.create('bpmn:Documentation', { text: String(value) })] : [];
    } else if (key === 'conditionExpression') {
      if (!is(element, 'bpmn:SequenceFlow')) throw new ToolError('conditionExpression only applies to sequence flows');
      out.conditionExpression = value ? s.moddle.create('bpmn:FormalExpression', { body: String(value) }) : undefined;
    } else if (['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = value;
    } else {
      throw new ToolError(`Property ${key}: only text, numbers and booleans can be set`);
    }
  }
  return out;
}

const isShape = (el) => el && !el.waypoints && el.type !== 'label';

/** The participant (or the root) a lane belongs to. */
function laneOwner(lane) {
  let el = lane;
  while (el && is(el, 'bpmn:Lane')) el = el.parent;
  return el;
}

/** Where to put a new shape of `size` in `parent` when no position was given: right of the rest. */
function freeSpot(s, parent, size, lane) {
  const siblings = (parent.children || []).filter((c) => isShape(c) && !is(c, 'bpmn:Lane'));
  const inLane = lane ? siblings.filter((c) => c.y >= lane.y && c.y + c.height <= lane.y + lane.height) : siblings;
  const area = lane || (parent === s.canvas.getRootElement() ? null : parent);
  const right = inLane.length ? Math.max(...inLane.map((c) => c.x + c.width)) : (area ? area.x + 100 : 160);
  const last = inLane.at(-1);
  const centerY = area ? area.y + area.height / 2 : last ? last.y + last.height / 2 : 200;
  return { x: right + GAP + size.width / 2, y: centerY };
}

export function addElements(modeler, elements) {
  const s = services(modeler);
  const root = s.canvas.getRootElement();
  const taken = new Set();
  const plans = elements.map((spec) => {
    if (typeof spec?.type !== 'string' || !/^bpmn:\w+$/.test(spec.type)) throw new ToolError(`Invalid type: ${spec?.type}`);
    let probe;
    try { probe = s.moddle.create(spec.type); } catch { throw new ToolError(`Unknown BPMN type: ${spec.type}`); }
    if (!ADDABLE.some((t) => is(probe, t))) throw new ToolError(`${spec.type} cannot be added here; use bpmn_connect for flows`);
    checkNewId(s, spec.id, taken);
    let parent = spec.parent === undefined ? null : lookup(s.registry, spec.parent);
    if (spec.type === 'bpmn:Lane') {
      if (!parent || !(is(parent, 'bpmn:Participant') || is(parent, 'bpmn:Lane'))) throw new ToolError('A lane needs a participant or lane as parent');
    } else if (spec.type !== 'bpmn:Participant') {
      if (!parent) parent = is(root, 'bpmn:Collaboration') ? root.children.find((c) => is(c, 'bpmn:Participant')) : root;
      if (!parent) throw new ToolError('This diagram has pools: give the participant to add the element to as parent');
    }
    for (const n of ['x', 'y']) if (spec[n] !== undefined && !Number.isFinite(spec[n])) throw new ToolError(`${n} must be a number`);
    cleanProperties(s, probe, spec.properties);
    const eventType = spec.properties?.eventDefinitionType;
    if (eventType !== undefined && !(typeof eventType === 'string' && /^bpmn:\w+EventDefinition$/.test(eventType))) {
      throw new ToolError(`Invalid eventDefinitionType: ${eventType}`);
    }
    return { spec, parent };
  });

  const created = [];
  for (const { spec, parent } of plans) {
    let shape;
    if (spec.type === 'bpmn:Lane') {
      shape = s.modeling.addLane(parent, 'bottom');
      if (spec.id) s.modeling.updateProperties(shape, { id: spec.id });
      if (spec.name) s.modeling.updateLabel(shape, spec.name);
    } else {
      const businessObject = s.bpmnFactory.create(spec.type, spec.id ? { id: spec.id } : {});
      const attrs = { type: spec.type, businessObject };
      const props = spec.properties || {};
      if (props.eventDefinitionType) attrs.eventDefinitionType = props.eventDefinitionType;
      if (props.isExpanded === true) attrs.isExpanded = true;
      shape = spec.type === 'bpmn:Participant' ? s.elementFactory.createParticipantShape(attrs) : s.elementFactory.createShape(attrs);
      const lane = parent && is(parent, 'bpmn:Lane') ? parent : null;
      const target = spec.type === 'bpmn:Participant' ? root : lane ? laneOwner(lane) : parent;
      const center = spec.x !== undefined && spec.y !== undefined
        ? { x: spec.x + shape.width / 2, y: spec.y + shape.height / 2 }
        : spec.type === 'bpmn:Participant'
          ? { x: 160 + shape.width / 2, y: Math.max(0, ...root.children.filter(isShape).map((c) => c.y + c.height)) + GAP + shape.height / 2 }
          : freeSpot(s, target, shape, lane);
      shape = s.modeling.createShape(shape, center, target);
      if (spec.name) s.modeling.updateLabel(shape, spec.name);
    }
    const extra = cleanProperties(s, shape, spec.properties);
    if (Object.keys(extra).length) s.modeling.updateProperties(shape, extra);
    created.push({ id: shape.id, type: shape.type, x: Math.round(shape.x), y: Math.round(shape.y), width: shape.width, height: shape.height, parent: shape.parent?.id });
  }
  return { created };
}

export function updateElements(modeler, updates) {
  const s = services(modeler);
  const taken = new Set();
  const plans = updates.map((u) => {
    const element = lookup(s.registry, u.id);
    const props = cleanProperties(s, element, u.properties);
    if (u.properties?.id !== undefined && u.properties.id !== element.id) {
      checkNewId(s, u.properties.id, taken);
      props.id = u.properties.id;
    }
    if ((u.x !== undefined || u.y !== undefined) && !isShape(element)) throw new ToolError(`${u.id} is a connection and cannot be moved`);
    for (const n of ['x', 'y']) if (u[n] !== undefined && !Number.isFinite(u[n])) throw new ToolError(`${n} must be a number`);
    if (u.name !== undefined && typeof u.name !== 'string') throw new ToolError('name must be text');
    return { u, element, props };
  });
  for (const { u, element, props } of plans) {
    if (u.name !== undefined) s.modeling.updateLabel(element, u.name);
    if (u.x !== undefined || u.y !== undefined) {
      const delta = { x: (u.x ?? element.x) - element.x, y: (u.y ?? element.y) - element.y };
      if (delta.x || delta.y) s.modeling.moveElements([element], delta);
    }
    if (Object.keys(props).length) s.modeling.updateProperties(element, props);
  }
  return { updated: plans.map(({ element }) => element.id) };
}

export function deleteElements(modeler, ids) {
  const s = services(modeler);
  const root = s.canvas.getRootElement();
  const elements = ids.map((id) => lookup(s.registry, id));
  if (elements.includes(root)) throw new ToolError('The process itself cannot be deleted');
  s.modeling.removeElements(elements);
  return { deleted: ids };
}

export function connect(modeler, connections) {
  const s = services(modeler);
  const taken = new Set();
  const plans = connections.map((c) => {
    const source = lookup(s.registry, c.source);
    const target = lookup(s.registry, c.target);
    if (!isShape(source) || !isShape(target)) throw new ToolError('Connect shapes, not connections');
    const allowed = s.rules.canConnect(source, target);
    if (!allowed) throw new ToolError(`${c.source} cannot be connected to ${c.target}`);
    if (c.type && c.type !== allowed.type) throw new ToolError(`${c.source} → ${c.target} can only be a ${allowed.type}, not a ${c.type}`);
    checkNewId(s, c.id, taken);
    return { c, source, target, allowed };
  });
  const created = [];
  for (const { c, source, target, allowed } of plans) {
    const businessObject = s.bpmnFactory.create(allowed.type, c.id ? { id: c.id } : {});
    const connection = s.modeling.connect(source, target, { ...allowed, businessObject });
    if (c.name) s.modeling.updateLabel(connection, c.name);
    created.push({ id: connection.id, type: connection.type, source: source.id, target: target.id });
  }
  return { created };
}

/** Lays the diagram out with bpmn-auto-layout and moves the existing elements to the new positions. */
export async function autoLayout(modeler) {
  const s = services(modeler);
  const root = s.canvas.getRootElement();
  if (is(root, 'bpmn:Collaboration') || s.registry.filter((el) => is(el, 'bpmn:Lane')).length) {
    throw new ToolError('Auto layout works only for diagrams without pools and lanes');
  }
  const { xml } = await modeler.saveXML();
  const laidOut = await layoutProcess(xml);
  const { rootElement } = await s.moddle.fromXML(laidOut, 'bpmn:Definitions');
  const target = new Map();
  for (const diagram of rootElement.diagrams || []) {
    for (const di of diagram.plane?.planeElement || []) if (di.bpmnElement?.id) target.set(di.bpmnElement.id, di);
  }
  const depth = (el) => { let d = 0; for (let p = el.parent; p; p = p.parent) d++; return d; };
  const shapes = s.registry.filter((el) => isShape(el) && el !== root && target.get(el.id)?.bounds).sort((a, b) => depth(a) - depth(b));
  let moved = 0;
  for (const shape of shapes) {
    const b = target.get(shape.id).bounds;
    const delta = { x: Math.round(b.x - shape.x), y: Math.round(b.y - shape.y) };
    if (delta.x || delta.y) { s.modeling.moveElements([shape], delta); moved++; }
    if (Math.round(b.width) !== shape.width || Math.round(b.height) !== shape.height) {
      s.modeling.resizeShape(shape, { x: shape.x, y: shape.y, width: b.width, height: b.height });
    }
  }
  for (const connection of s.registry.filter((el) => el.waypoints)) {
    const di = target.get(connection.id);
    if (di?.waypoint?.length >= 2) s.modeling.updateWaypoints(connection, di.waypoint.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
  }
  return { moved };
}
