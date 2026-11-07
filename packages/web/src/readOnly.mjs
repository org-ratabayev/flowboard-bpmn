// Read-only mode for viewers, switched on and off without re-creating the modeler.
//
// Blocks every way the diagram can change (commands, undo/redo, drags that move or create,
// text editing, the context pad and replace menus) and hides the editing tools. Selecting,
// panning, zooming, the minimap, token simulation, linting and exports keep working.
// The server refuses changes from viewers anyway; this only makes the editor match.

// drag prefixes (diagram-js / bpmn-js) that change the diagram; 'hand' and 'lasso' only navigate or select
const EDITING_DRAGS = [
  'shape.move', 'connect', 'global-connect', 'connectionSegment.move', 'bendpoint.move',
  'resize', 'create', 'spaceTool', 'spaceTool.selection'
];

/** Wraps `object[name]` so it does nothing while `isActive()`; returns `whenActive` instead. */
function guard(object, name, isActive, whenActive) {
  const original = object[name].bind(object);
  object[name] = (...args) => (isActive() ? whenActive : original(...args));
}

export function createReadOnly(modeler, { propertiesEl } = {}) {
  let active = false;
  const isActive = () => active;
  const container = modeler.get('canvas').getContainer();

  const commandStack = modeler.get('commandStack');
  for (const name of ['execute', 'undo', 'redo']) guard(commandStack, name, isActive, undefined);
  guard(commandStack, 'canExecute', isActive, false);
  guard(commandStack, 'canUndo', isActive, false);
  guard(commandStack, 'canRedo', isActive, false);

  const eventBus = modeler.get('eventBus');
  eventBus.on(EDITING_DRAGS.map((prefix) => `${prefix}.start`), 10000, () => (active ? false : undefined));

  guard(modeler.get('directEditing'), 'activate', isActive, false);
  const contextPad = modeler.get('contextPad');
  guard(contextPad, 'open', isActive, undefined);
  const popupMenu = modeler.get('popupMenu');
  guard(popupMenu, 'open', isActive, undefined);

  return {
    get active() { return active; },
    set(value) {
      active = !!value;
      container.classList.toggle('read-only', active);
      propertiesEl?.classList.toggle('read-only', active);
      if (active) {
        contextPad.close();
        popupMenu.close();
        modeler.get('directEditing').cancel?.();
        modeler.get('dragging').cancel?.();
      }
    }
  };
}
