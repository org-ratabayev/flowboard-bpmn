// Zoom buttons in the bottom-left corner of the canvas: zoom in, zoom out, fit the diagram.
// They only move the view (canvas API), never the diagram, so they are shown to every role,
// viewers included. Plain DOM, no inline handlers (strict CSP).

export const ZOOM_STEP = 1.2;
export const ZOOM_MIN = 0.2; // same bounds as bpmn-js wheel zoom
export const ZOOM_MAX = 4;

/** The zoom level one step in (`direction` 1) or out (-1), kept within the bounds. */
export function nextZoom(current, direction) {
  const next = direction > 0 ? current * ZOOM_STEP : current / ZOOM_STEP;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

const BUTTONS = [
  { action: 'in', label: 'Zoom in', text: '+' },
  { action: 'out', label: 'Zoom out', text: '−' },
  { action: 'fit', label: 'Fit diagram to view', text: '⤢' }
];

export function createZoomControls(canvas, parent) {
  const group = document.createElement('div');
  group.className = 'zoom-controls';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Zoom');
  const run = {
    in: () => canvas.zoom(nextZoom(canvas.zoom(), 1)),
    out: () => canvas.zoom(nextZoom(canvas.zoom(), -1)),
    fit: () => canvas.zoom('fit-viewport', 'auto')
  };
  for (const { action, label, text } of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.zoom = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    button.addEventListener('click', run[action]);
    group.append(button);
  }
  parent.append(group);
  return group;
}
