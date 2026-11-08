// AI proposals: all edits of one chat turn form one proposal that the user keeps or undoes.
//
// Before the first edit of a turn the diagram is copied (XML) and the position in the undo
// history noted. When the turn ends, the changed elements are highlighted (bpmn-js-differ
// colours). Undo steps back through the editor's undo history, so later redo still works; when
// that history was cleared meanwhile (a full replace, or a change received from someone else),
// it restores the copy instead. Kept and still open proposals feed the next version note.

import { describeChanges, versionNote } from './changes.mjs';

const MARKERS = { added: 'diff-added', changed: 'diff-changed', moved: 'diff-moved' };

/** host: { modeler, restore(xml) (import without asking), confirm(message) } */
export function createProposals(host) {
  const { modeler } = host;
  const commandStack = modeler.get('commandStack');
  const canvas = modeler.get('canvas');
  const registry = modeler.get('elementRegistry');
  const listeners = new Set();
  let open = null;   // proposal of the running or last turn, until kept or undone
  let notes = [];    // proposals that count for the next save: { summary }
  let replacing = false;

  const emit = (proposal) => { for (const fn of listeners) fn(proposal); };

  // any import clears the undo history; one we did not start is a change by someone else
  modeler.on('import.done', () => {
    if (!open || open.status === 'kept' || open.status === 'undone') return;
    open.historyLost = true;
    if (!replacing) open.foreignChange = true;
  });

  function unmark(proposal) {
    for (const [id, cls] of proposal.marked) if (registry.get(id)) canvas.removeMarker(id, cls);
    proposal.marked = [];
  }

  function mark(proposal) {
    unmark(proposal);
    for (const [kind, cls] of Object.entries(MARKERS)) {
      for (const id of proposal.changes[kind]) {
        if (registry.get(id)) { canvas.addMarker(id, cls); proposal.marked.push([id, cls]); }
      }
    }
  }

  function keep(proposal = open) {
    if (!proposal || proposal.status !== 'ready') return;
    unmark(proposal);
    proposal.status = 'kept';
    emit(proposal);
  }

  return {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    get open() { return open; },

    /** Called before each edit tool of a turn; the first one starts the turn's proposal. */
    async begin(turn) {
      if (open?.turn === turn) return open;
      if (open?.status === 'ready') keep(open); // a new prompt keeps the previous proposal
      const { xml } = await modeler.saveXML();
      open = { turn, status: 'editing', before: xml, startIndex: commandStack._stackIdx, endIndex: null, historyLost: false, foreignChange: false, summary: null, changes: null, marked: [] };
      return open;
    },

    /** The model's own description of the turn's edits (bpmn_summarize_changes). */
    setSummary(turn, summary) {
      if (open?.turn === turn) open.summary = summary;
    },

    /** Runs `fn` (a full replace) without counting its import as someone else's change. */
    async replacing(fn) {
      replacing = true;
      try { return await fn(); } finally { replacing = false; }
    },

    /** The turn ended: highlight what changed. Returns the proposal, or null when nothing changed. */
    async finish(turn) {
      if (open?.turn !== turn || open.status !== 'editing') return null;
      const proposal = open;
      const moddle = modeler.get('moddle');
      const { rootElement: before } = await moddle.fromXML(proposal.before, 'bpmn:Definitions');
      const changes = describeChanges(before, modeler.getDefinitions());
      if (!changes.summary) {
        open = null;
        return null;
      }
      proposal.changes = changes;
      proposal.summary ??= changes.summary;
      proposal.endIndex = commandStack._stackIdx;
      proposal.status = 'ready';
      notes.push(proposal);
      mark(proposal);
      emit(proposal);
      return proposal;
    },

    keep,

    /** Reverts the proposal; asks first when the diagram was changed after it. */
    async undo(proposal = open) {
      if (!proposal || proposal.status !== 'ready') return false;
      const editedAfter = proposal.foreignChange || commandStack._stackIdx !== proposal.endIndex;
      if (editedAfter && !host.confirm('The diagram was changed after the AI\'s edits. Undo the AI\'s edits anyway? Changes made after them are undone too.')) return false;
      unmark(proposal);
      if (!proposal.historyLost && commandStack._stackIdx >= proposal.startIndex) {
        while (commandStack._stackIdx > proposal.startIndex && commandStack.canUndo()) commandStack.undo();
      } else {
        await this.replacing(() => host.restore(proposal.before));
      }
      proposal.status = 'undone';
      notes = notes.filter((p) => p !== proposal);
      if (open === proposal) open = null;
      emit(proposal);
      return true;
    },

    /** The version note for the AI changes since the last save ('' when there are none). */
    note() {
      return versionNote(notes.map((p) => p.summary));
    },

    /** After a save: open proposals count as kept, and their notes are used up. */
    saved() {
      if (open?.status === 'ready') keep(open);
      notes = [];
    },

    /** The diagram was reloaded or replaced by the user: forget everything. */
    reset() {
      if (open) unmark(open);
      const was = open;
      open = null;
      notes = [];
      if (was?.status === 'ready') { was.status = 'kept'; emit(was); }
    }
  };
}
