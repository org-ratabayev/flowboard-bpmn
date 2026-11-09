// "Delete project" dialog (owner only): a soft delete by default, which an admin can undo, and a
// secondary "Delete permanently instead" that needs the project name typed in. The server checks the
// role and the typed name again; this dialog only explains and collects the confirmation.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SOFT_DELETE_TEXT =
  "The project will be removed from your list and from everyone it's shared with. It is kept in the database, and a server admin can restore it.";
export const PERMANENT_DELETE_TEXT =
  'Permanent deletion removes the project with its whole history, sharing, links, invitations and AI chats. It cannot be undone, not even by an admin.';

/**
 * Opens the dialog for `project` ({ id, name }); `onDeleted(permanent)` runs after the server
 * deleted it. Returns the <dialog> element.
 */
export function openDeleteDialog({ project, onDeleted }) {
  document.querySelector('dialog.delete-dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'save-dialog delete-dialog';
  dialog.setAttribute('aria-labelledby', 'deleteTitle');
  dialog.innerHTML = `
    <h2 id="deleteTitle">Delete “${esc(project.name)}”?</h2>
    <p class="delete-soft-text">${esc(SOFT_DELETE_TEXT)}</p>
    <p class="error" hidden></p>
    <div class="actions">
      <span class="spacer"></span>
      <button type="button" class="delete-cancel">Cancel</button>
      <button type="button" class="danger delete-soft">Delete project</button>
    </div>
    <details class="delete-permanent">
      <summary>Delete permanently instead</summary>
      <p class="delete-permanent-text">${esc(PERMANENT_DELETE_TEXT)}</p>
      <label for="deleteConfirmName">Type <b>${esc(project.name)}</b> to confirm</label>
      <div class="actions">
        <input type="text" id="deleteConfirmName" autocomplete="off" spellcheck="false">
        <button type="button" class="danger delete-hard" disabled>Delete permanently</button>
      </div>
    </details>`;
  document.body.append(dialog);
  const $ = (sel) => dialog.querySelector(sel);
  const input = $('#deleteConfirmName');
  const showError = (message) => { $('.error').textContent = message; $('.error').hidden = !message; };

  async function remove(permanent) {
    showError('');
    for (const b of dialog.querySelectorAll('button')) b.disabled = true;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
        headers: permanent ? { 'Content-Type': 'application/json' } : {},
        body: permanent ? JSON.stringify({ permanent: true, confirmName: input.value }) : undefined
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      dialog.close();
      onDeleted?.(permanent);
    } catch (err) {
      showError(err.message);
      for (const b of dialog.querySelectorAll('button')) b.disabled = false;
      $('.delete-hard').disabled = input.value !== project.name;
    }
  }

  input.addEventListener('input', () => { $('.delete-hard').disabled = input.value !== project.name; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('.delete-hard').disabled) remove(true); });
  $('.delete-permanent').addEventListener('toggle', () => { if ($('.delete-permanent').open) input.focus(); });
  $('.delete-cancel').addEventListener('click', () => dialog.close());
  $('.delete-soft').addEventListener('click', () => remove(false));
  $('.delete-hard').addEventListener('click', () => remove(true));
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  $('.delete-cancel').focus();
  return dialog;
}
