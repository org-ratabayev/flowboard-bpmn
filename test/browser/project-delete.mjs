// Headless Chrome check of deleting projects: the Delete action on the project list (owners only),
// the dialog with its explanation and the typed name for a permanent delete, and the notice in an
// open editor when its project is deleted. No blocking confirm() is used.
//
// Run: node test/browser/project-delete.mjs (pnpm test runs it). Without Chrome it prints
// "BROWSER TESTS SKIPPED" and exits successfully.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, launch } from './cdp.mjs';
import { diagram, startServer } from '../helpers/server.mjs';
import { PERMANENT_DELETE_TEXT, SOFT_DELETE_TEXT } from '../../packages/web/src/deleteDialog.mjs';

const chromeBin = findChrome();
if (!chromeBin) {
  console.log('BROWSER TESTS SKIPPED: Chrome or Chromium was not found (set CHROME_BIN to its path to run them).');
  process.exit(0);
}

let server;
let page;

before(async () => {
  server = await startServer();
  page = await launch(chromeBin);
});
after(async () => {
  await page?.close();
  await server?.stop();
});

async function signInAs(name) {
  const [cookieName, value] = (await server.signIn(name)).split('=');
  await page.setCookie({ name: cookieName, value, url: server.base });
}
const create = async (name) => (await server.as('Olivia')('POST', '/api/projects', { name, xml: diagram(name) })).body.id;
async function openList() {
  await page.goto(`${server.base}/`);
  await page.waitFor(`document.querySelector('#list table, #list .empty')`, { what: 'the project list' });
}
const listedIds = () => page.eval(`[...document.querySelectorAll('#list tbody a[href^="/p/"]')].map((a) => decodeURIComponent(a.getAttribute('href').slice(3)))`);
const openDialog = (id) => page.eval(`(() => {
  document.querySelector('button[data-delete="${id}"]').click();
  const d = document.querySelector('dialog.delete-dialog');
  return { open: d.open, modal: d.matches(':modal'), title: d.querySelector('h2').textContent, soft: d.querySelector('.delete-soft-text').textContent,
    permanentOpen: d.querySelector('details.delete-permanent').open, hardDisabled: d.querySelector('.delete-hard').disabled };
})()`);
const typeName = (text) => page.eval(`(() => {
  const input = document.getElementById('deleteConfirmName');
  input.value = ${JSON.stringify(text)};
  input.dispatchEvent(new Event('input'));
  return document.querySelector('.delete-hard').disabled;
})()`);

describe('deleting projects in the browser', () => {
  it('shows an open editor that its project was deleted', async () => {
    const id = await create('Open board');
    await signInAs('Olivia');
    await page.goto(`${server.base}/p/${id}`);
    await page.waitFor(`document.querySelector('.djs-element[data-element-id="Activity_1"]')`, { what: 'the diagram' });
    await new Promise((r) => setTimeout(r, 300)); // the live stream connects after the first load
    assert.equal((await server.as('Olivia')('DELETE', `/api/projects/${id}`)).status, 204);
    await page.waitFor(`document.getElementById('projectDeleted')`, { what: 'the deleted notice' });
    assert.equal(await page.eval(`document.querySelector('#projectDeleted h1').textContent`), 'This project was deleted');
    assert.equal(await page.eval(`!!document.getElementById('save')`), false, 'no Save button left');
  });

  it('shows Delete only to owners', async () => {
    const shared = await create('Shared board');
    await server.grant(shared, 'Eddie', 'editor', 'Olivia');
    await signInAs('Eddie');
    await openList();
    assert.deepEqual(await listedIds(), [shared]);
    assert.equal(await page.eval(`document.querySelectorAll('button[data-delete]').length`), 0);
    await signInAs('Olivia');
    await openList();
    assert.ok(await page.eval(`!!document.querySelector('button[data-delete="${shared}"]')`));
  });

  it('soft-deletes from the dialog after explaining what happens', async () => {
    const id = await create('Soft board');
    await openList();
    const dialog = await openDialog(id);
    assert.deepEqual(dialog, { open: true, modal: true, title: 'Delete “Soft board”?', soft: SOFT_DELETE_TEXT, permanentOpen: false, hardDisabled: true });

    await page.eval(`document.querySelector('.delete-cancel').click()`);
    await page.waitFor(`!document.querySelector('dialog.delete-dialog')`, { what: 'the dialog to close' });
    assert.ok((await listedIds()).includes(id));

    await openDialog(id);
    await page.eval(`document.querySelector('.delete-soft').click()`);
    await page.waitFor(`![...document.querySelectorAll('#list a')].some((a) => a.getAttribute('href') === '/p/${id}')`, { what: 'the list without it' });
    assert.match(await page.eval(`document.getElementById('toast').textContent`), /was deleted/);
    assert.equal((await server.as('Olivia')('GET', `/api/projects/${id}`)).status, 404);
  });

  it('deletes permanently only after the name is typed', async () => {
    const id = await create('Hard board');
    await openList();
    await openDialog(id);
    await page.eval(`document.querySelector('details.delete-permanent summary').click()`);
    assert.equal(await page.eval(`document.querySelector('.delete-permanent-text').textContent`), PERMANENT_DELETE_TEXT);
    assert.equal(await typeName('hard board'), true);
    assert.equal(await typeName('Hard board'), false);
    await page.eval(`document.querySelector('.delete-hard').click()`);
    await page.waitFor(`![...document.querySelectorAll('#list a')].some((a) => a.getAttribute('href') === '/p/${id}')`, { what: 'the list without it' });
    assert.match(await page.eval(`document.getElementById('toast').textContent`), /deleted permanently/);
    // gone for good: the id is free again
    assert.equal(await create('Hard board'), id);
  });

  it('had no errors and no blocking dialogs in the page', () => {
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.dialogs, []);
  });
});
