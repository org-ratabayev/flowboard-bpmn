// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanSummary, describeChanges, versionNote } from './changes.mjs';
import { orderProcess, parse } from './test-fixtures.mjs';

const REVIEW = `<bpmn:task id="Review" name="Review order" />
  <bpmn:sequenceFlow id="Flow_R" sourceRef="Pack" targetRef="Review" />`;
const REVIEW_DI = `<bpmndi:BPMNShape id="Review_di" bpmnElement="Review"><dc:Bounds x="400" y="220" width="100" height="80" /></bpmndi:BPMNShape>
  <bpmndi:BPMNEdge id="Flow_R_di" bpmnElement="Flow_R"><di:waypoint x="290" y="160" /><di:waypoint x="400" y="260" /></bpmndi:BPMNEdge>`;

describe('describeChanges', () => {
  it('finds added, renamed and removed elements and writes a plain summary', async () => {
    const before = await parse(orderProcess());
    const withoutEnd = orderProcess({ packName: 'Pack items', extra: REVIEW, extraDi: REVIEW_DI })
      .replace(/<bpmn:endEvent[\s\S]*?<\/bpmn:endEvent>/, '')
      .replace('<bpmn:outgoing>Flow_3</bpmn:outgoing>', '')
      .replace(/<bpmn:sequenceFlow id="Flow_3"[^>]*\/>/, '')
      .replace(/<bpmndi:BPMN(Shape|Edge) id="(End|Flow_3)_di"[\s\S]*?<\/bpmndi:BPMN(Shape|Edge)>/g, '');
    const after = await parse(withoutEnd);
    const changes = describeChanges(before, after);
    expect(changes.added.sort()).toEqual(['Flow_R', 'Review']);
    expect(changes.changed).toEqual(['Pack']);
    expect(changes.removed.sort()).toEqual(['End', 'Flow_3']);
    expect(changes.summary.details).toEqual([
      "Add task 'Review order'",
      "Connect 'Pack items' → 'Review order'",
      "Rename task 'Pack order' to 'Pack items'",
      ...changes.summary.details.slice(3) // removals, in the differ's order
    ]);
    expect(changes.summary.details.slice(3).sort()).toEqual(["Remove end event 'Order shipped'", "Remove the flow 'Ship order' → 'Order shipped'"]);
    expect(changes.summary.title).toBe("Add task 'Review order' and 4 more changes");
  });

  it('tells naming from renaming', async () => {
    const unnamed = await parse(orderProcess({ packName: '' }));
    const named = await parse(orderProcess({ packName: 'Pack order' }));
    expect(describeChanges(unnamed, named).summary.title).toBe("Name task Pack 'Pack order'");
    expect(describeChanges(named, unnamed).summary.title).toBe("Remove the name 'Pack order' of task Pack");
  });

  it('reports moves alone, and nothing when nothing changed', async () => {
    const before = await parse(orderProcess());
    const moved = await parse(orderProcess().replace('x="240" y="80"', 'x="250" y="90"'));
    expect(describeChanges(before, moved)).toMatchObject({ moved: ['Pack'], summary: { title: 'Move 1 element', details: [] } });
    expect(describeChanges(before, await parse(orderProcess())).summary).toBeNull();
  });
});

describe('version notes', () => {
  it('cleans what the model wrote', () => {
    expect(cleanSummary({ title: '  Add review step.  ', details: ['- Add task Review order\n', '', '* Connect it'] }))
      .toEqual({ title: 'Add review step', details: ['Add task Review order', 'Connect it'] });
    expect(cleanSummary({ title: '', details: ['x'] })).toBeNull();
    expect(cleanSummary({ title: 'x'.repeat(200) }).title).toHaveLength(80);
  });

  it('prefix AI: and combine several turns, titles first and all points after', () => {
    expect(versionNote([])).toBe('');
    expect(versionNote([{ title: 'Add review step', details: ['Add task Review order', 'Connect Pack order to it'] }]))
      .toBe('AI: Add review step\n- Add task Review order\n- Connect Pack order to it');
    expect(versionNote([{ title: 'Rename end event', details: [] }])).toBe('AI: Rename end event');
    expect(versionNote([
      { title: 'Add review step', details: ['Add task Review order'] },
      { title: "Remove end event 'Done'", details: [] } // a fallback summary of one change
    ])).toBe("AI: Add review step; Remove end event 'Done'\n- Add task Review order\n- Remove end event 'Done'");
  });
});
