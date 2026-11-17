import { describe, expect, it } from 'vitest';
import { EMPTY_DIAGRAM } from './bpmn.ts';
import { summarizeBpmn, validateBpmn } from './bpmnModel.ts';

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
const shape = (id: string) => `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" bioc:stroke="#000" color:border-color="#000"><dc:Bounds x="0" y="0" width="100" height="80" /></bpmndi:BPMNShape>`;
const edge = (id: string) => `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}"><di:waypoint x="0" y="0" /><di:waypoint x="10" y="0" /></bpmndi:BPMNEdge>`;
const wrap = (body: string, plane: string, root = 'Process_1') => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Defs" targetNamespace="http://example.com/bpmn">${body}
  <bpmndi:BPMNDiagram id="D"><bpmndi:BPMNPlane id="P" bpmnElement="${root}">${plane}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const process = (extra = '') => `<bpmn:process id="Process_1" name="Orders">
  <bpmn:startEvent id="Start" /><bpmn:task id="Pack" name="Pack" /><bpmn:endEvent id="End" />
  <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Pack" /><bpmn:sequenceFlow id="F2" sourceRef="Pack" targetRef="End" name="done" />
  ${extra}</bpmn:process>`;
const fullPlane = [shape('Start'), shape('Pack'), shape('End'), edge('F1'), edge('F2')].join('');

const POOL = wrap(
  `<bpmn:collaboration id="Collab"><bpmn:participant id="Shop" name="Shop" processRef="Process_1" />
     <bpmn:participant id="Customer" name="Customer" /><bpmn:messageFlow id="M1" sourceRef="Customer" targetRef="Start" /></bpmn:collaboration>
   <bpmn:process id="Process_1"><bpmn:laneSet id="LS">
     <bpmn:lane id="Sales"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef></bpmn:lane>
     <bpmn:lane id="Warehouse" name="Warehouse"><bpmn:flowNodeRef>Pick</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
     <bpmn:startEvent id="Start" /><bpmn:userTask id="Pick" name="Pick items" /></bpmn:process>`,
  ['Shop', 'Customer', 'Sales', 'Warehouse', 'Start', 'Pick'].map(shape).join('') + edge('M1'),
  'Collab',
);

const SUB = wrap(
  `<bpmn:process id="Process_1"><bpmn:subProcess id="Sub" name="Inner"><bpmn:startEvent id="SubStart" /><bpmn:task id="SubTask" />
     <bpmn:sequenceFlow id="SF" sourceRef="SubStart" targetRef="SubTask" /></bpmn:subProcess></bpmn:process>`,
  ['Sub', 'SubStart', 'SubTask'].map(shape).join('') + edge('SF'),
);

describe('validateBpmn', () => {
  it('accepts a complete diagram, the empty diagram, a collaboration with lanes and a sub-process', async () => {
    for (const xml of [wrap(process(), fullPlane), EMPTY_DIAGRAM, POOL, SUB]) {
      const result = await validateBpmn(xml);
      expect(result).toMatchObject({ ok: true });
    }
  });

  it('rejects empty, malformed and oversized input', async () => {
    expect(await validateBpmn('')).toEqual({ ok: false, problems: ['The XML must be a non-empty string'] });
    const broken = await validateBpmn('<bpmn:definitions><bpmn:process>');
    expect(broken.ok === false && broken.problems[0]).toMatch(/does not parse/);
    const big = await validateBpmn(' '.repeat(20 * 1024 * 1024) + '<a/>');
    expect(big.ok === false && big.problems[0]).toMatch(/20 MB/);
  });

  it('reports unknown elements and unresolved references as import warnings', async () => {
    const unknown = await validateBpmn(wrap(process('<bpmn:unknownThing id="U" />'), fullPlane));
    expect(unknown.ok).toBe(false);
    const dangling = await validateBpmn(wrap(process().replace('targetRef="End"', 'targetRef="Nope"'), fullPlane));
    expect(dangling.ok === false && dangling.problems.join('\n')).toMatch(/Import warning.*Nope/);
  });

  it('names flow nodes and sequence flows without DI', async () => {
    const noShape = await validateBpmn(wrap(process(), fullPlane.replace(shape('Pack'), '')));
    expect(noShape).toEqual({ ok: false, problems: ['Task "Pack" has no BPMNShape in the diagram'] });
    const noEdge = await validateBpmn(wrap(process(), fullPlane.replace(edge('F2'), '')));
    expect(noEdge).toEqual({ ok: false, problems: ['SequenceFlow "F2" has no BPMNEdge in the diagram'] });
  });

  it('requires shapes for participants, lanes, sub-process children and message flow edges', async () => {
    const result = await validateBpmn(POOL.replace(shape('Customer'), '').replace(shape('Warehouse'), '').replace(edge('M1'), ''));
    expect(result.ok === false && result.problems).toEqual([
      'Participant "Customer" has no BPMNShape in the diagram',
      'MessageFlow "M1" has no BPMNEdge in the diagram',
      'Lane "Warehouse" has no BPMNShape in the diagram',
    ]);
    const sub = await validateBpmn(SUB.replace(shape('SubTask'), ''));
    expect(sub.ok === false && sub.problems).toEqual(['Task "SubTask" has no BPMNShape in the diagram']);
  });

  it('requires a diagram at all and caps the number of problems', async () => {
    const none = await validateBpmn(`<bpmn:definitions ${NS} id="D" targetNamespace="x">${process()}</bpmn:definitions>`);
    expect(none.ok === false && none.problems[0]).toMatch(/no bpmndi:BPMNDiagram/);
    const tasks = Array.from({ length: 40 }, (_, i) => `<bpmn:task id="T${i}" />`).join('');
    const many = await validateBpmn(wrap(`<bpmn:process id="Process_1">${tasks}</bpmn:process>`, ''));
    expect(many.ok === false && many.problems).toHaveLength(21);
    expect(many.ok === false && many.problems.at(-1)).toBe('... and 20 more problems');
  });
});

describe('summarizeBpmn', () => {
  it('lists nodes, flows and counts without layout', async () => {
    const result = await summarizeBpmn(wrap(process(), fullPlane));
    expect(result).toEqual({
      ok: true,
      summary: {
        processes: [{ id: 'Process_1', name: 'Orders' }],
        participants: [],
        lanes: [],
        nodes: [
          { id: 'Start', type: 'StartEvent', process: 'Process_1' },
          { id: 'Pack', type: 'Task', name: 'Pack', process: 'Process_1' },
          { id: 'End', type: 'EndEvent', process: 'Process_1' },
        ],
        flows: [
          { id: 'F1', source: 'Start', target: 'Pack' },
          { id: 'F2', source: 'Pack', target: 'End', name: 'done' },
        ],
        messageFlows: [],
        counts: { nodes: 3, flows: 2, lanes: 0 },
      },
    });
  });

  it('maps pools, lanes and message flows', async () => {
    const result = await summarizeBpmn(POOL);
    if (!result.ok) throw new Error('expected a summary');
    const { summary } = result;
    expect(summary.participants).toEqual([{ id: 'Shop', name: 'Shop', process: 'Process_1' }, { id: 'Customer', name: 'Customer' }]);
    expect(summary.processes).toEqual([{ id: 'Process_1', participant: 'Shop' }]);
    expect(summary.lanes).toEqual([{ id: 'Sales', process: 'Process_1' }, { id: 'Warehouse', name: 'Warehouse', process: 'Process_1' }]);
    expect(summary.nodes.map((n) => [n.id, n.lane])).toEqual([['Start', 'Sales'], ['Pick', 'Warehouse']]);
    expect(summary.messageFlows).toEqual([{ id: 'M1', source: 'Customer', target: 'Start' }]);
  });

  it('includes sub-process content with its parent, and marks conditions and default flows', async () => {
    const sub = await summarizeBpmn(SUB);
    if (!sub.ok) throw new Error('expected a summary');
    expect(sub.summary.nodes.map((n) => [n.id, n.parent])).toEqual([['Sub', undefined], ['SubStart', 'Sub'], ['SubTask', 'Sub']]);

    const gateway = wrap(
      `<bpmn:process id="Process_1"><bpmn:exclusiveGateway id="G" default="Other" /><bpmn:task id="A" /><bpmn:task id="B" />
         <bpmn:sequenceFlow id="Cond" sourceRef="G" targetRef="A"><bpmn:conditionExpression>x</bpmn:conditionExpression></bpmn:sequenceFlow>
         <bpmn:sequenceFlow id="Other" sourceRef="G" targetRef="B" /></bpmn:process>`,
      '',
    );
    const result = await summarizeBpmn(gateway);
    if (!result.ok) throw new Error('expected a summary');
    expect(result.summary.flows).toEqual([
      { id: 'Cond', source: 'G', target: 'A', condition: true },
      { id: 'Other', source: 'G', target: 'B', default: true },
    ]);
  });

  it('is much smaller than the XML and reports parse errors', async () => {
    const xml = wrap(process(), fullPlane);
    const result = await summarizeBpmn(xml);
    expect(JSON.stringify(result).length).toBeLessThan(xml.length);
    expect(await summarizeBpmn('not xml')).toMatchObject({ ok: false });
  });

  it('does not mark a flow without id as default', async () => {
    const xml = wrap(`<bpmn:process id="Process_1"><bpmn:task id="A" /><bpmn:task id="B" /><bpmn:sequenceFlow sourceRef="A" targetRef="B" /></bpmn:process>`, '');
    const result = await summarizeBpmn(xml);
    expect(result.ok && result.summary.flows).toEqual([{ source: 'A', target: 'B' }]);
  });

  it('reports boundary hosts, event triggers and the number of import warnings', async () => {
    const xml = wrap(
      `<bpmn:process id="Process_1"><bpmn:task id="T" /><bpmn:boundaryEvent id="B" attachedToRef="T"><bpmn:timerEventDefinition /></bpmn:boundaryEvent>
         <bpmn:startEvent id="S" /><bpmn:unknownThing id="U" /></bpmn:process>`,
      '',
    );
    const result = await summarizeBpmn(xml);
    if (!result.ok) throw new Error('expected a summary');
    expect(result.summary.nodes).toEqual([
      { id: 'T', type: 'Task', process: 'Process_1' },
      { id: 'B', type: 'BoundaryEvent', process: 'Process_1', attachedTo: 'T', event: 'timer' },
      { id: 'S', type: 'StartEvent', process: 'Process_1' },
    ]);
    expect(result.summary.warnings).toBe(1);
  });
});

describe('robustness', () => {
  it('never throws on deeply nested sub-processes and lanes', async () => {
    const depth = 20000;
    const subs = `${'<bpmn:subProcess id="S">'.repeat(depth)}${'</bpmn:subProcess>'.repeat(depth)}`;
    const deepSub = wrap(`<bpmn:process id="Process_1">${subs}</bpmn:process>`, '');
    expect((await validateBpmn(deepSub)).ok).toBe(false);
    expect(await summarizeBpmn(deepSub)).toBeDefined();
    const lanes = `${'<bpmn:lane id="L"><bpmn:childLaneSet>'.repeat(depth)}${'</bpmn:childLaneSet></bpmn:lane>'.repeat(depth)}`;
    const deepLane = wrap(`<bpmn:process id="Process_1"><bpmn:laneSet>${lanes}</bpmn:laneSet></bpmn:process>`, '');
    expect((await validateBpmn(deepLane)).ok).toBe(false);
    expect(await summarizeBpmn(deepLane)).toBeDefined();
  });

  it('handles any input without throwing', async () => {
    for (const input of [42, {}, null, undefined, '<', '\u0000']) {
      expect((await validateBpmn(input)).ok).toBe(false);
      expect((await summarizeBpmn(input)).ok).toBe(false);
    }
  });

  it('flags the wrong DI kind, shapes without bounds and edges without waypoints', async () => {
    const asEdge = fullPlane.replace(shape('Pack'), edge('Pack'));
    expect(await validateBpmn(wrap(process(), asEdge))).toEqual({ ok: false, problems: ['Task "Pack" is drawn with a BPMNEdge, it needs a BPMNShape'] });
    const asShape = fullPlane.replace(edge('F1'), shape('F1'));
    expect(await validateBpmn(wrap(process(), asShape))).toEqual({ ok: false, problems: ['SequenceFlow "F1" is drawn with a BPMNShape, it needs a BPMNEdge'] });
    const noBounds = fullPlane.replace(shape('Pack'), '<bpmndi:BPMNShape id="x" bpmnElement="Pack" />');
    expect(await validateBpmn(wrap(process(), noBounds))).toEqual({ ok: false, problems: ['The BPMNShape of Task "Pack" has no dc:Bounds'] });
    const noPoints = fullPlane.replace(edge('F1'), '<bpmndi:BPMNEdge id="x" bpmnElement="F1"><di:waypoint x="0" y="0" /></bpmndi:BPMNEdge>');
    expect(await validateBpmn(wrap(process(), noPoints))).toEqual({ ok: false, problems: ['The BPMNEdge of SequenceFlow "F1" needs at least two di:waypoint'] });
  });

  it('bounds the length of problems', async () => {
    const long = 'a'.repeat(100_000);
    const tasks = Array.from({ length: 25 }, (_, i) => `<bpmn:task id="${long}${i}" />`).join('');
    const result = await validateBpmn(wrap(`<bpmn:process id="Process_1">${tasks}</bpmn:process>`, ''));
    expect(result.ok === false && result.problems.join('').length).toBeLessThan(3000);
    const unresolved = await validateBpmn(wrap(process().replace('targetRef="End"', `targetRef="${long}"`), fullPlane));
    expect(unresolved.ok === false && unresolved.problems.join('').length).toBeLessThan(500);
  });

  it('treats prototype-like ids as ordinary ids', async () => {
    const xml = wrap(`<bpmn:process id="Process_1"><bpmn:task id="constructor" /><bpmn:task id="__proto__" /></bpmn:process>`, shape('constructor'));
    const result = await validateBpmn(xml);
    expect(result.ok === false && result.problems.join('\n')).toMatch(/property names/);
    expect(await summarizeBpmn(xml)).toMatchObject({ ok: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// Shaped like bpmn-js / Camunda Modeler output: vendor attributes, data, annotations, groups, collapsed sub-process.
const EDITOR_NS = `${NS} xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" ` +
  'xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"';
const bounds = (id: string) => `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" bioc:stroke="#000" color:border-color="#000"><dc:Bounds x="0" y="0" width="100" height="80" /></bpmndi:BPMNShape>`;
const EDITOR_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${EDITOR_NS} id="Defs" targetNamespace="http://example.com/bpmn" exporter="Modeler" exporterVersion="1">
  <bpmn:collaboration id="Collab">
    <bpmn:participant id="Shop" name="Shop" processRef="Shop_Process" />
    <bpmn:participant id="Customer" name="Customer" />
    <bpmn:messageFlow id="Msg" sourceRef="Customer" targetRef="Start" />
    <bpmn:group id="Grp" categoryValueRef="Cat_V" />
    <bpmn:textAnnotation id="Note"><bpmn:text>Check stock</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc" sourceRef="Pick" targetRef="Note" />
  </bpmn:collaboration>
  <bpmn:category id="Cat"><bpmn:categoryValue id="Cat_V" value="Group" /></bpmn:category>
  <bpmn:process id="Shop_Process" isExecutable="true" camunda:historyTimeToLive="P1D">
    <bpmn:laneSet id="LS"><bpmn:lane id="Sales" name="Sales"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Pick</bpmn:flowNodeRef>
      <bpmn:flowNodeRef>Timer</bpmn:flowNodeRef><bpmn:flowNodeRef>Collapsed</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing><bpmn:messageEventDefinition id="MED" /></bpmn:startEvent>
    <bpmn:userTask id="Pick" name="Pick" camunda:assignee="demo">
      <bpmn:extensionElements><zeebe:taskDefinition type="pick" /></bpmn:extensionElements>
      <bpmn:dataOutputAssociation id="DOA"><bpmn:targetRef>DOR</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:userTask>
    <bpmn:boundaryEvent id="Timer" attachedToRef="Pick"><bpmn:timerEventDefinition id="TED" /></bpmn:boundaryEvent>
    <bpmn:dataObjectReference id="DOR" dataObjectRef="DO" /><bpmn:dataObject id="DO" />
    <bpmn:dataStoreReference id="Store" />
    <bpmn:subProcess id="Collapsed"><bpmn:task id="Inner" /></bpmn:subProcess>
    <bpmn:subProcess id="EventSub" triggeredByEvent="true"><bpmn:startEvent id="ES" /></bpmn:subProcess>
    <bpmn:transaction id="Tx" />
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Pick" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Collab">
    ${['Shop', 'Customer', 'Sales', 'Start', 'Pick', 'Timer', 'Collapsed', 'EventSub', 'ES', 'Tx', 'DOR', 'Store', 'Note', 'Grp'].map(bounds).join('')}
    ${edge('F1')}${edge('Msg')}${edge('Assoc')}${edge('DOA')}
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="D2"><bpmndi:BPMNPlane id="P2" bpmnElement="Collapsed">${bounds('Inner')}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe('editor-style diagram', () => {
  it('validates cleanly and summarizes sensibly', async () => {
    expect(await validateBpmn(EDITOR_DIAGRAM)).toEqual({ ok: true, definitions: expect.anything() });
    const result = await summarizeBpmn(EDITOR_DIAGRAM);
    if (!result.ok) throw new Error('expected a summary');
    const { summary } = result;
    expect(summary.warnings).toBeUndefined();
    expect(summary.participants).toEqual([{ id: 'Shop', name: 'Shop', process: 'Shop_Process' }, { id: 'Customer', name: 'Customer' }]);
    const byId = Object.fromEntries(summary.nodes.map((n) => [n.id, n]));
    expect(byId.Start).toMatchObject({ type: 'StartEvent', event: 'message', lane: 'Sales' });
    expect(byId.Timer).toMatchObject({ attachedTo: 'Pick', event: 'timer' });
    expect(byId.Inner).toMatchObject({ parent: 'Collapsed' });
    expect(summary.messageFlows).toEqual([{ id: 'Msg', source: 'Customer', target: 'Start' }]);
  });
});
