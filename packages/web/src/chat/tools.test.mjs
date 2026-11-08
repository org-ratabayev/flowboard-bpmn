// @vitest-environment jsdom
// The tool dispatcher with a stand-in for the modeler: what can be checked without rendering.
// The modeling-based edit tools run in headless Chrome (test/browser/).
import { describe, expect, it, vi } from 'vitest';
import lintConfig from '../lint-config.mjs';
import { orderProcess, moddle, parse } from './test-fixtures.mjs';
import { createChatTools } from './tools.mjs';

async function setup({ readOnly = false } = {}) {
  const definitions = await parse(orderProcess());
  const instance = moddle();
  const modeler = {
    getDefinitions: () => definitions,
    get: (name) => ({ moddle: instance, elementRegistry: { filter: () => [1, 2, 3] } })[name],
    saveXML: async () => ({ xml: orderProcess() }),
    saveSVG: async () => ({ svg: '<svg />' })
  };
  const host = {
    modeler,
    lintConfig,
    isReadOnly: () => readOnly,
    beforeEdit: vi.fn(async () => {}),
    replaceDiagram: vi.fn(async () => {}),
    onSummary: vi.fn()
  };
  return { host, tools: createChatTools(host) };
}

describe('chat tools', () => {
  it('answer read tools from the current diagram', async () => {
    const { tools } = await setup();
    const summary = await tools.execute('bpmn_get_summary', {});
    expect(summary.isError).toBe(false);
    expect(JSON.parse(summary.content).counts['bpmn:Task']).toBe(2);
    const elements = JSON.parse((await tools.execute('bpmn_get_elements', { ids: ['Ship'] })).content);
    expect(elements.elements[0].name).toBe('Ship order');
    expect((await tools.execute('bpmn_get_xml')).content).toBe(orderProcess());
    expect((await tools.execute('bpmn_export_svg')).content).toBe('<svg />');
    expect(await tools.execute('bpmn_get_elements', { ids: [] })).toEqual({ content: 'ids must be a non-empty list', isError: true });
  });

  it('lint with the editor’s bpmnlint rules', async () => {
    const { tools } = await setup();
    const result = JSON.parse((await tools.execute('bpmn_lint')).content);
    expect(result.count).toBe(result.problems.length);
    for (const p of result.problems) expect(p).toHaveProperty('rule');
  });

  it('refuse edit tools while the editor is read-only', async () => {
    const { tools, host } = await setup({ readOnly: true });
    for (const name of ['bpmn_add_elements', 'bpmn_replace_xml', 'bpmn_summarize_changes']) {
      const result = await tools.execute(name, {});
      expect(result).toEqual({ content: 'The user can only view this diagram; it cannot be changed', isError: true });
    }
    expect(host.beforeEdit).not.toHaveBeenCalled();
  });

  it('record the model’s summary of its changes for the turn', async () => {
    const { tools, host } = await setup();
    const turn = { request: 'add a review' };
    const result = await tools.execute('bpmn_summarize_changes', { title: 'Add review step.', details: ['Add task Review order'] }, turn);
    expect(result.isError).toBe(false);
    expect(host.onSummary).toHaveBeenCalledWith({ title: 'Add review step', details: ['Add task Review order'] }, turn);
    expect(host.beforeEdit).not.toHaveBeenCalled(); // describing is not editing
    expect((await tools.execute('bpmn_summarize_changes', { details: [] })).isError).toBe(true);
  });

  it('validate replacement XML before applying it, and lay out XML without layout', async () => {
    const { tools, host } = await setup();
    const turn = {};
    const bad = await tools.execute('bpmn_replace_xml', { xml: orderProcess({ extra: '<bpmn:madeUpThing />' }) }, turn);
    expect(bad.isError).toBe(true);
    expect(bad.content).toMatch(/^Not applied: The XML has/);
    expect(host.replaceDiagram).not.toHaveBeenCalled();

    const plain = orderProcess().replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, '');
    const ok = await tools.execute('bpmn_replace_xml', { xml: plain }, turn);
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.content)).toMatchObject({ replaced: true, layoutGenerated: true });
    expect(host.beforeEdit).toHaveBeenCalledWith('bpmn_replace_xml', turn);
    expect(host.replaceDiagram.mock.calls[0][0]).toMatch(/BPMNShape/);
  });

  it('report unknown tools and unexpected failures as tool errors', async () => {
    const { tools, host } = await setup();
    expect(await tools.execute('rm_rf', {})).toEqual({ content: 'Unknown tool: rm_rf', isError: true });
    host.modeler.saveSVG = async () => { throw new Error('boom'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await tools.execute('bpmn_export_svg')).toEqual({ content: 'The editor failed to run bpmn_export_svg: boom', isError: true });
  });
});
