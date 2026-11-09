// @vitest-environment jsdom
// The delete dialog: what it tells the owner, and the typed name before a permanent delete.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDeleteDialog, PERMANENT_DELETE_TEXT, SOFT_DELETE_TEXT } from './deleteDialog.mjs';

const project = { id: 'order-flow', name: 'Order <Flow>' };

beforeEach(() => {
  // jsdom has <dialog> without the modal methods
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; this.dispatchEvent(new Event('close')); };
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

const type = (dialog, text) => {
  const input = dialog.querySelector('#deleteConfirmName');
  input.value = text;
  input.dispatchEvent(new Event('input'));
};
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('delete dialog', () => {
  it('explains the soft delete and escapes the project name', () => {
    const dialog = openDeleteDialog({ project });
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2').textContent).toBe('Delete “Order <Flow>”?');
    expect(dialog.querySelector('.delete-soft-text').textContent).toBe(SOFT_DELETE_TEXT);
    expect(SOFT_DELETE_TEXT).toMatch(/kept in the database, and a server admin can restore it/);
    expect(dialog.querySelector('.delete-permanent summary').textContent).toBe('Delete permanently instead');
    expect(dialog.querySelector('.delete-permanent-text').textContent).toBe(PERMANENT_DELETE_TEXT);
    expect(PERMANENT_DELETE_TEXT).toMatch(/cannot be undone/);
    expect(dialog.querySelector('.delete-permanent').open).toBe(false);
  });

  it('soft-deletes without a body', async () => {
    const onDeleted = vi.fn();
    const dialog = openDeleteDialog({ project, onDeleted });
    dialog.querySelector('.delete-soft').click();
    await settle();
    expect(fetch).toHaveBeenCalledWith('/api/projects/order-flow', expect.objectContaining({ method: 'DELETE', body: undefined }));
    expect(onDeleted).toHaveBeenCalledWith(false);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('deletes permanently only after the exact name is typed, and sends it along', async () => {
    const onDeleted = vi.fn();
    const dialog = openDeleteDialog({ project, onDeleted });
    const button = dialog.querySelector('.delete-hard');
    expect(button.disabled).toBe(true);
    type(dialog, 'order <flow>');
    expect(button.disabled).toBe(true);
    type(dialog, 'Order <Flow>');
    expect(button.disabled).toBe(false);
    button.click();
    await settle();
    const [, init] = fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ permanent: true, confirmName: 'Order <Flow>' });
    expect(onDeleted).toHaveBeenCalledWith(true);
  });

  it('shows the server error and stays open', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Only the owner can delete this project' }), { status: 403 }));
    const onDeleted = vi.fn();
    const dialog = openDeleteDialog({ project, onDeleted });
    dialog.querySelector('.delete-soft').click();
    await settle();
    await settle();
    expect(dialog.querySelector('.error').textContent).toBe('Only the owner can delete this project');
    expect(dialog.querySelector('.error').hidden).toBe(false);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.delete-soft').disabled).toBe(false);
    expect(dialog.querySelector('.delete-hard').disabled).toBe(true);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
