// Zoom buttons in the bottom-left corner of the canvas: zoom in, zoom out, fit the diagram.
// They only move the view (canvas API), never the diagram, so they are shown to every role,
// viewers included. Plain DOM, no inline handlers (strict CSP).

export const ZOOM_STEP = 1.2;
export const ZOOM_MIN = 0.2; // same bounds as bpmn-js wheel zoom
export const ZOOM_MAX = 4;

/**
 * The zoom level one step in (`direction` 1) or out (-1), kept within the bounds. Monotonic: a level
 * already outside the bounds (fit-to-view has none) is never moved the wrong way, so out never zooms in.
 */
export function nextZoom(current, direction) {
  if (direction > 0) return Math.max(current, Math.min(ZOOM_MAX, current * ZOOM_STEP));
  return Math.min(current, Math.max(ZOOM_MIN, current / ZOOM_STEP));
}

// Icons as inline SVG paths (24x24 grid): no font dependency, allowed by the CSP
const ICONS = {
  in: 'M12 5v14M5 12h14',
  out: 'M5 12h14',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'
};

function icon(path) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const el = document.createElementNS(ns, 'path');
  el.setAttribute('d', path);
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '2');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  svg.append(el);
  return svg;
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
  for (const { action, label } of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.zoom = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon(ICONS[action]));
    button.addEventListener('click', run[action]);
    group.append(button);
  }
  parent.append(group);
  return group;
}
