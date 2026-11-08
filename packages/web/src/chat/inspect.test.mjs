// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { details, summarize } from './inspect.mjs';
import { orderProcess, parse, POOL } from './test-fixtures.mjs';
import { validateBpmnXml } from './validate.mjs';
import { moddle } from './test-fixtures.mjs';

describe('bpmn_get_summary', () => {
  it('lists processes, counts and every element with its flows and position', async () => {
    const summary = summarize(await parse(orderProcess()));
    expect(summary.processes).toEqual([{ id: 'Process_1', name: 'Orders' }]);
    expect(summary.collaboration).toBe(false);
    expect(summary.counts).toEqual({ 'bpmn:StartEvent': 1, 'bpmn:Task': 2, 'bpmn:EndEvent': 1, 'bpmn:SequenceFlow': 3 });
    expect(summary.elements.find((e) => e.id === 'Pack')).toEqual({
      id: 'Pack', type: 'bpmn:Task', name: 'Pack order', parent: 'Process_1',
      incoming: ['Flow_1'], outgoing: ['Flow_2'], x: 240, y: 80, width: 100, height: 80
    });
    expect(summary.elements.find((e) => e.id === 'Flow_2')).toMatchObject({ source: 'Pack', target: 'Ship' });
  });

  it('names participants as parents and lanes of flow nodes', async () => {
    const summary = summarize(await parse(POOL));
    expect(summary.processes).toEqual([{ id: 'Process_1', participant: 'Shop' }]);
    expect(summary.collaboration).toBe(true);
    expect(summary.elements.find((e) => e.id === 'Pick')).toMatchObject({ type: 'bpmn:UserTask', parent: 'Shop', lane: 'Warehouse' });
    expect(summary.elements.find((e) => e.id === 'Sales')).toMatchObject({ type: 'bpmn:Lane', parent: 'Shop' });
  });
});

describe('bpmn_get_elements', () => {
  it('returns properties with references as ids, nested elements and bounds', async () => {
    const result = details(await parse(orderProcess()), ['Pack', 'Flow_2', 'Nope']);
    expect(result.missing).toEqual(['Nope']);
    const [pack, flow] = result.elements;
    expect(pack).toMatchObject({
      type: 'bpmn:Task', id: 'Pack', name: 'Pack order', incoming: ['Flow_1'], outgoing: ['Flow_2'],
      documentation: [{ type: 'bpmn:Documentation', text: 'Put items in a box' }],
      bounds: { x: 240, y: 80, width: 100, height: 80 }
    });
    expect(flow).toMatchObject({ sourceRef: 'Pack', targetRef: 'Ship', waypoints: [{ x: 340, y: 120 }, { x: 400, y: 120 }] });
  });

  it('lists the children of containers by id only', async () => {
    const [process] = details(await parse(POOL), ['Process_1']).elements;
    expect(process.laneSets).toEqual(['Sales', 'Warehouse']);
    expect(process.flowElements).toEqual(['Start', 'Pick']);
  });
});

describe('bpmn_replace_xml validation', () => {
  const check = (xml) => validateBpmnXml(moddle(), xml);

  it('accepts a valid diagram and tells whether it has a layout', async () => {
    expect(await check(orderProcess())).toMatchObject({ ok: true, hasLayout: true });
    const noLayout = orderProcess().replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, '');
    expect(await check(noLayout)).toMatchObject({ ok: true, hasLayout: false });
  });

  it('rejects broken, unknown or empty content', async () => {
    expect(await check('')).toEqual({ ok: false, error: 'xml is empty' });
    expect((await check('<html></html>')).error).toMatch(/no definitions element/);
    expect((await check('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process')).error).toMatch(/could not be read|problem/);
    expect((await check(orderProcess({ extra: '<bpmn:madeUpThing id="X" />' }))).error).toMatch(/problem/);
    expect((await check(orderProcess({ extra: '<bpmn:task id="Pack" />' }))).error).toMatch(/problem/);
    expect((await check(orderProcess({ extra: '<bpmn:sequenceFlow id="F9" sourceRef="Pack" targetRef="Missing" />' }))).error).toMatch(/problem/);
    const empty = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x" />';
    expect((await check(empty)).error).toBe('The XML contains no process or collaboration');
  });
});
