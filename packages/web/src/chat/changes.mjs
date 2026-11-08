// What an AI proposal changed, and the version note for it.
//
// `describeChanges` compares two moddle trees with bpmn-js-differ: element ids to highlight, and a
// plain summary in case the model did not describe its edits with bpmn_summarize_changes.
// `versionNote` combines the summaries of the AI turns before a save into one note.

import { diff } from 'bpmn-js-differ';

const MAX_TITLE = 80;
const MAX_DETAILS = 12;
const MAX_NOTE = 2000;

// attributes that change as a side effect of connecting or moving elements, not by themselves
const STRUCTURAL = /^(incoming|outgoing|flowNodeRef|childLaneSet|flowElements|artifacts|laneSets|participants|messageFlows)\b/;
const isDiType = (el) => /^(bpmndi|dc|di):/.test(el?.$type || '');
const isFlow = (el) => /^bpmn:(SequenceFlow|MessageFlow|Association|DataInputAssociation|DataOutputAssociation)$/.test(el?.$type || '');

/** "user task", "exclusive gateway", … */
export function typeWords(type) {
  return String(type || '').replace(/^bpmn:/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

const named = (el) => (el?.name ? `'${el.name}'` : el?.id || '?');
const label = (el) => `${typeWords(el.$type)} ${named(el)}`;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Changes from `before` to `after` (moddle definitions).
 * Returns { added, changed, moved, removed: ids, summary: { title, details } | null }.
 */
export function describeChanges(before, after) {
  const result = diff(before, after);
  const added = Object.values(result._added).filter((el) => !isDiType(el));
  const removed = Object.values(result._removed).filter((el) => el.$type && !isDiType(el));
  const changed = Object.values(result._changed)
    .map(({ model, attrs }) => ({ model, attrs: Object.fromEntries(Object.entries(attrs).filter(([key]) => !STRUCTURAL.test(key))) }))
    .filter(({ model, attrs }) => Object.keys(attrs).length && !result._added[model.id]);
  const changedIds = new Set(changed.map((c) => c.model.id));
  const moved = Object.keys(result._layoutChanged).filter((id) => !result._added[id] && !changedIds.has(id) && !result._removed[id]);

  const details = [];
  for (const el of added.filter((e) => !isFlow(e))) details.push(`Add ${label(el)}`);
  for (const el of added.filter(isFlow)) {
    const what = el.name ? ` labeled '${el.name}'` : '';
    details.push(`Connect ${named(el.sourceRef)} → ${named(el.targetRef)}${what}`);
  }
  for (const { model, attrs } of changed) {
    const { name, ...rest } = attrs;
    if (name) {
      // bpmn-js-differ reports the values the other way round: newValue is the earlier one
      const [from, to] = [name.newValue, name.oldValue];
      if (!to) details.push(`Remove the name '${from}' of ${typeWords(model.$type)} ${model.id}`);
      else details.push(from ? `Rename ${typeWords(model.$type)} '${from}' to '${to}'` : `Name ${typeWords(model.$type)} ${model.id} '${to}'`);
    }
    const others = Object.keys(rest).map((key) => key.replace(/\[\d+\]$/, ''));
    if (others.length) details.push(`Change ${[...new Set(others)].join(', ')} of ${label(model)}`);
  }
  for (const el of removed) {
    details.push(isFlow(el) ? `Remove the flow ${named(el.sourceRef)} → ${named(el.targetRef)}` : `Remove ${label(el)}`);
  }
  if (moved.length) details.push(moved.length === 1 ? 'Move 1 element' : `Move ${moved.length} elements`);

  const summary = details.length
    ? {
        title: clip(details.length === 1 ? details[0] : `${details[0]} and ${details.length - 1} more change${details.length > 2 ? 's' : ''}`, MAX_TITLE),
        details: details.length === 1 ? [] : details.slice(0, MAX_DETAILS)
      }
    : null;
  return {
    added: added.map((el) => el.id),
    changed: [...changedIds],
    moved,
    removed: removed.map((el) => el.id),
    summary
  };
}

/** Cleans a summary written by the model: one line each, no bullets, limited length and count. */
export function cleanSummary(input) {
  const line = (text, max) => clip(String(text ?? '').replace(/\s+/g, ' ').replace(/^[-*•\s]+/, '').trim(), max);
  const title = line(input?.title, MAX_TITLE).replace(/\.$/, '');
  const details = (Array.isArray(input?.details) ? input.details : []).map((d) => line(d, 160)).filter(Boolean).slice(0, MAX_DETAILS);
  return title ? { title, details } : null;
}

/**
 * The version note for the AI changes made before a save: "AI: <titles>" and the merged points.
 * `summaries`: one { title, details } per AI turn, in order.
 */
export function versionNote(summaries) {
  const list = summaries.filter((s) => s?.title);
  if (!list.length) return '';
  const titles = [...new Set(list.map((s) => s.title))];
  const details = [...new Set(list.flatMap((s) => (s.details?.length ? s.details : list.length > 1 ? [s.title] : [])))];
  const head = `AI: ${titles.join('; ')}`;
  const body = details.slice(0, MAX_DETAILS * 2).map((d) => `- ${d}`).join('\n');
  return clip(body ? `${head}\n${body}` : head, MAX_NOTE);
}
