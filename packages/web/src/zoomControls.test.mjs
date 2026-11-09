// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createZoomControls, nextZoom, ZOOM_MAX, ZOOM_MIN } from './zoomControls.mjs';

function fakeCanvas(level = 1) {
  const calls = [];
  return {
    calls,
    zoom(arg, center) {
      if (arg === undefined) return level;
      calls.push([arg, center]);
      if (typeof arg === 'number') level = arg;
      return level;
    }
  };
}

describe('nextZoom', () => {
  it('steps in and out and stays within the bounds', () => {
    expect(nextZoom(1, 1)).toBeGreaterThan(1);
    expect(nextZoom(1, -1)).toBeLessThan(1);
    expect(nextZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(nextZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(nextZoom(3.9, 1)).toBe(ZOOM_MAX);
  });

  it('never moves the wrong way from a level outside the bounds', () => {
    expect(nextZoom(0.1, -1)).toBe(0.1); // fit-to-view can go below the minimum
    expect(nextZoom(0.1, 1)).toBeGreaterThan(0.1);
    expect(nextZoom(5, 1)).toBe(5);
    expect(nextZoom(5, -1)).toBeLessThan(5);
  });
});

describe('createZoomControls', () => {
  it('adds three labelled buttons that drive the canvas', () => {
    const canvas = fakeCanvas();
    const parent = document.createElement('div');
    createZoomControls(canvas, parent);
    const buttons = [...parent.querySelectorAll('.zoom-controls button')];
    expect(buttons.map((b) => b.dataset.zoom)).toEqual(['in', 'out', 'fit']);
    for (const b of buttons) {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-label')).toBeTruthy();
      expect(b.title).toBe(b.getAttribute('aria-label'));
    }
    buttons[0].click();
    expect(canvas.zoom()).toBeGreaterThan(1);
    buttons[1].click();
    expect(canvas.zoom()).toBeCloseTo(1);
    buttons[2].click();
    expect(canvas.calls.at(-1)).toEqual(['fit-viewport', 'auto']);
  });
});
