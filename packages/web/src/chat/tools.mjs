// Runs the assistant's tool calls in the editor (the browser side of chat/toolSpecs.ts on the
// server) and turns the outcome into the tool result text sent back to the model.
//
// The server already refuses edit tools to viewers; here they are refused too while the editor
// is read-only. `beforeEdit` runs before every edit tool (the proposal snapshots the diagram).

import { Linter } from 'bpmnlint';
import { layoutProcess } from 'bpmn-auto-layout';
import { cleanSummary } from './changes.mjs';
import { addElements, autoLayout, connect, deleteElements, ToolError, updateElements } from './edit.mjs';
import { details, summarize } from './inspect.mjs';
import { validateBpmnXml } from './validate.mjs';

export const EDIT_TOOLS = new Set([
  'bpmn_add_elements', 'bpmn_update_elements', 'bpmn_delete_elements', 'bpmn_connect',
  'bpmn_replace_xml', 'bpmn_auto_layout', 'bpmn_summarize_changes'
]);

const MAX_RESULT_CHARS = 1_500_000; // the server accepts 2 MB per result

const list = (value, name) => {
  if (!Array.isArray(value) || !value.length) throw new ToolError(`${name} must be a non-empty list`);
  return value;
};

/**
 * host: { modeler, isReadOnly(), lintConfig, beforeEdit(name, turn), replaceDiagram(xml), onSummary(summary, turn) }
 * `turn` is whatever the caller passes to execute() to tell turns apart.
 */
export function createChatTools(host) {
  const { modeler } = host;

  const handlers = {
    bpmn_get_summary: () => summarize(modeler.getDefinitions()),
    bpmn_get_elements: (input) => details(modeler.getDefinitions(), list(input.ids, 'ids')),
    bpmn_get_xml: async () => (await modeler.saveXML({ format: true })).xml,
    bpmn_lint: async () => {
      const results = await new Linter(host.lintConfig).lint(modeler.getDefinitions());
      const problems = Object.entries(results).flatMap(([rule, reports]) =>
        reports.map((r) => ({ rule, id: r.id, message: r.message, category: r.category })));
      return { problems, count: problems.length };
    },
    bpmn_export_svg: async () => (await modeler.saveSVG()).svg,
    bpmn_add_elements: (input) => addElements(modeler, list(input.elements, 'elements')),
    bpmn_update_elements: (input) => updateElements(modeler, list(input.updates, 'updates')),
    bpmn_delete_elements: (input) => deleteElements(modeler, list(input.ids, 'ids')),
    bpmn_connect: (input) => connect(modeler, list(input.connections, 'connections')),
    bpmn_auto_layout: () => autoLayout(modeler),
    bpmn_replace_xml: async (input) => {
      const checked = await validateBpmnXml(modeler.get('moddle'), input.xml);
      if (!checked.ok) throw new ToolError(`Not applied: ${checked.error}`);
      const xml = checked.hasLayout ? input.xml : await layoutProcess(input.xml);
      await host.replaceDiagram(xml);
      return { replaced: true, layoutGenerated: !checked.hasLayout, elements: modeler.get('elementRegistry').filter((e) => e.type !== 'label').length };
    },
    bpmn_summarize_changes: (input, turn) => {
      const summary = cleanSummary(input);
      if (!summary) throw new ToolError('title is required');
      host.onSummary(summary, turn);
      return 'Recorded for the version history.';
    }
  };

  return {
    /** Runs one tool call; never throws. */
    async execute(name, input = {}, turn = null) {
      const handler = handlers[name];
      if (!handler) return { content: `Unknown tool: ${name}`, isError: true };
      try {
        if (EDIT_TOOLS.has(name)) {
          if (host.isReadOnly()) throw new ToolError('The user can only view this diagram; it cannot be changed');
          if (name !== 'bpmn_summarize_changes') await host.beforeEdit(name, turn);
        }
        const value = await handler(input && typeof input === 'object' ? input : {}, turn);
        const content = typeof value === 'string' ? value : JSON.stringify(value);
        if (content.length > MAX_RESULT_CHARS) return { content: 'The result is too large to send; ask for less (e.g. single elements).', isError: true };
        return { content, isError: false };
      } catch (err) {
        if (!(err instanceof ToolError)) console.warn(`Chat tool ${name} failed`, err);
        return { content: err instanceof ToolError ? err.message : `The editor failed to run ${name}: ${err?.message || err}`, isError: true };
      }
    }
  };
}
