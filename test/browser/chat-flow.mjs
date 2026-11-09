// End-to-end check of the AI chat in a real editor (headless Chrome): prompt → tool calls run by
// the editor → proposal → Keep / Undo → save with the version note.
//
// The provider is a local stand-in that speaks the Anthropic streaming protocol and plays back a
// script; each scripted step can look at the tool results the editor sent (they arrive with the
// next request), so the editor's tool executors are checked here too.
//
// Run: node test/browser/chat-flow.mjs (pnpm test runs it after the unit and API tests).
// Without Chrome it prints "BROWSER TESTS SKIPPED" and exits successfully. CHROME_BIN sets the
// browser to use (when it does not exist, the check is skipped).

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { findChrome, launch } from './cdp.mjs';
import { startServer } from '../helpers/server.mjs';
import { orderProcess } from '../../packages/web/src/chat/test-fixtures.mjs';

const chromeBin = findChrome();
if (!chromeBin) {
  console.log('BROWSER TESTS SKIPPED: Chrome or Chromium was not found (set CHROME_BIN to its path to run them).');
  process.exit(0);
}

const KEY = 'browser-test-team-key-1234';

// ---- provider stand-in ----------------------------------------------------------------------

const script = []; // one step per /v1/messages request: (lastToolResults) => blocks
const requests = [];
const sse = (res, data) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);

function reply(res, blocks) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  sse(res, { type: 'message_start', message: { usage: { input_tokens: 1000 } } });
  blocks.forEach((block, index) => {
    if (block.text !== undefined) {
      sse(res, { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      sse(res, { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    } else {
      sse(res, { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      sse(res, { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) } });
    }
    sse(res, { type: 'content_block_stop', index });
  });
  const usesTools = blocks.some((b) => b.name);
  sse(res, { type: 'message_delta', delta: { stop_reason: usesTools ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 50 } });
  sse(res, { type: 'message_stop' });
  res.end();
}

const provider = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push(body);
  // the results of the previous step's tool calls, by tool name
  const last = body.messages.at(-1);
  const names = new Map(body.messages.flatMap((m) => m.content.filter((b) => b.type === 'tool_use').map((b) => [b.id, b.name])));
  const results = Array.isArray(last.content)
    ? last.content.filter((b) => b.type === 'tool_result').map((b) => ({ name: names.get(b.tool_use_id), content: b.content, isError: !!b.is_error }))
    : [];
  const step = script.shift();
  if (!step) {
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'no scripted step left' } }));
  }
  try {
    reply(res, step(results, body));
  } catch (err) {
    stepErrors.push(err);
    reply(res, [{ text: `Script check failed: ${err.message}` }]);
  }
});
const stepErrors = [];

const call = (name, input) => ({ id: `toolu_${Math.random().toString(36).slice(2, 10)}`, name, input });

// ---- setup ----------------------------------------------------------------------------------

let server;
let page;
let projectId;

before(async () => {
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  server = await startServer({
    LLM_MODE: 'managed',
    TEAM_LLM_KEY: KEY,
    CHAT_TOOL_TIMEOUT_MS: '15000',
    CHAT_TURNS_PER_MINUTE: '0',
    LLM_PROVIDERS: JSON.stringify([
      { id: 'team', label: 'Team models', type: 'anthropic', baseUrl: `http://127.0.0.1:${provider.address().port}`, models: ['model-a'], credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } }
    ])
  });
  projectId = (await server.request('POST', '/api/projects', { name: 'Orders', xml: orderProcess() })).body.id;
  page = await launch(chromeBin);
  const [name, value] = (await server.signIn('Tester')).split('=');
  await page.setCookie({ name, value, url: server.base });
  await page.goto(`${server.base}/p/${projectId}`);
  await page.waitFor(`document.querySelector('.djs-element[data-element-id="Pack"]')`, { what: 'the diagram' });
  await page.waitFor(`!document.getElementById('chatBtn').hidden`, { what: 'the chat button' });
  await page.eval(`document.getElementById('chatBtn').click()`);
  await page.waitFor(`document.querySelectorAll('#chatModel option').length`, { what: 'the model picker' });
});

after(async () => {
  await page?.close();
  await server?.stop();
  provider.close();
});

// ---- helpers --------------------------------------------------------------------------------

const has = (id) => page.eval(`!!document.querySelector('.djs-element[data-element-id="${id}"]')`);
const label = (id) => page.eval(`document.querySelector('.djs-element[data-element-id="${id}"] text')?.textContent ?? null`);
const marked = (id, cls) => page.eval(`!!document.querySelector('.djs-element.${cls}[data-element-id="${id}"]')`);

async function send(message) {
  stepErrors.length = 0;
  await page.eval(`(() => {
    const input = document.getElementById('chatInput');
    input.value = ${JSON.stringify(message)};
    document.getElementById('chatSend').click();
  })()`);
  await page.waitFor(`!document.getElementById('chatCancel').hidden`, { what: 'the turn to start', timeoutMs: 5000 }).catch(() => {});
  await page.waitFor(`document.getElementById('chatCancel').hidden`, { what: 'the turn to end', timeoutMs: 30000 });
  const left = script.splice(0).length; // a failed step must not leave steps for the next test
  if (stepErrors.length) throw stepErrors[0];
  assert.equal(left, 0, 'all scripted steps were used');
}

const lastReply = () => page.eval(`[...document.querySelectorAll('.chat-msg.assistant')].at(-1)?.innerText`);

// ---- the flow -------------------------------------------------------------------------------

describe('Editor chrome', () => {
  const zoomLevel = () => page.eval(`parseFloat(document.querySelector('.viewport').getAttribute('transform').replace('matrix(', ''))`);
  const clickZoom = (action) => page.eval(`document.querySelector('[data-zoom="${action}"]').click()`);

  it('has no Copy link button (links live in the Share dialog)', async () => {
    assert.equal(await page.eval(`!!document.getElementById('copyLink')`), false);
    assert.equal(await page.eval(`!![...document.querySelectorAll('button')].find((b) => /copy link/i.test(b.textContent))`), false);
    assert.equal(await page.eval(`!!document.getElementById('shareBtn')`), true);
  });

  // layout changes are noticed by the ResizeObserver on the next frame; a person clicks later than that
  const settle = () => page.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))`);
  const viewport = async (width, height) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await settle();
  };
  // where the diagram sits in the canvas, as fractions of the canvas box
  const diagramBox = () => page.eval(`(() => {
    const c = document.getElementById('canvas').getBoundingClientRect();
    const d = document.querySelector('.viewport').getBoundingClientRect();
    return { left: d.left - c.left, right: c.right - d.right, top: d.top - c.top, bottom: c.bottom - d.bottom, width: c.width, height: c.height };
  })()`);
  const assertFitted = async (what) => {
    const b = await diagramBox();
    assert.ok(b.left >= -1 && b.right >= -1 && b.top >= -1 && b.bottom >= -1, `${what}: the diagram lies inside the canvas ${JSON.stringify(b)}`);
    assert.ok(Math.abs(b.left - b.right) < 2 && Math.abs(b.top - b.bottom) < 2, `${what}: the diagram is centred ${JSON.stringify(b)}`);
  };
  const noOverlap = (selector) => page.eval(`(() => {
    const z = document.querySelector('.zoom-controls').getBoundingClientRect();
    const o = document.querySelector('${selector}').getBoundingClientRect();
    return z.right <= o.left || z.left >= o.right || z.bottom <= o.top || z.top >= o.bottom;
  })()`);

  it('zooms in, out and fits the diagram with the buttons bottom-left of the canvas', async () => {
    assert.equal(await page.eval(`document.querySelectorAll('.zoom-controls button').length`), 3);
    assert.equal(await page.eval(`[...document.querySelectorAll('.zoom-controls button')].every((b) => b.title && b.getAttribute('aria-label'))`), true);

    // one click on fit is right straight away, with the chat panel open
    await clickZoom('fit');
    await assertFitted('fit with the chat open');
    const fitted = await zoomLevel();
    await clickZoom('in');
    const zoomedIn = await zoomLevel();
    assert.ok(zoomedIn > fitted, `zoom in: ${zoomedIn} > ${fitted}`);
    await clickZoom('out');
    await clickZoom('out');
    const zoomedOut = await zoomLevel();
    assert.ok(zoomedOut < fitted, `zoom out: ${zoomedOut} < ${fitted}`);
    await clickZoom('fit');
    assert.ok(Math.abs((await zoomLevel()) - fitted) < 1e-3, 'fit returns to the fitted level');
  });

  it('measures the canvas again after a panel opens or closes or the window changes', async () => {
    await page.eval(`document.getElementById('closeChat').click()`);
    await settle();
    await clickZoom('fit');
    await assertFitted('fit after closing the chat');
    await page.eval(`document.getElementById('propertiesBtn').click()`);
    await settle();
    await clickZoom('fit');
    await assertFitted('fit after opening Properties');
    await page.eval(`document.getElementById('propertiesBtn').click()`);
    await settle();
    await viewport(900, 700);
    await clickZoom('fit');
    await assertFitted('fit after resizing the window');
    await viewport(1400, 900);
    await clickZoom('fit');
    await assertFitted('fit after enlarging the window');
  });

  it('keeps the buttons clear of the palette and the bpmn.io watermark at laptop window sizes', async () => {
    for (const [w, h] of [[1280, 800], [1366, 768], [1400, 900], [1280, 850]]) {
      await viewport(w, h);
      await clickZoom('fit');
      assert.equal(await noOverlap('.djs-palette'), true, `palette at ${w}x${h}`);
      assert.equal(await noOverlap('.bjs-powered-by'), true, `watermark at ${w}x${h}`);
      assert.equal(await page.eval(`document.querySelector('.zoom-controls').getBoundingClientRect().left - document.getElementById('canvas').getBoundingClientRect().left < 200`), true, 'bottom-left');
      assert.equal(await page.eval(`document.getElementById('canvas').getBoundingClientRect().bottom - document.querySelector('.zoom-controls').getBoundingClientRect().bottom < 40`), true, 'bottom');
    }
    await viewport(1400, 900);
  });
});

describe('AI chat in the editor', () => {
  it('runs the edit tools through modeling and shows one proposal for the turn; Undo reverts it', async () => {
    script.push(
      () => [call('bpmn_get_summary', {})],
      ([summary]) => {
        const parsed = JSON.parse(summary.content);
        assert.equal(summary.name, 'bpmn_get_summary');
        assert.ok(parsed.elements.some((e) => e.id === 'Pack' && e.name === 'Pack order'));
        return [{ text: 'Adding a review step. ' }, call('bpmn_add_elements', { elements: [{ id: 'Review', type: 'bpmn:Task', name: 'Review order', x: 400, y: 220 }] })];
      },
      ([added]) => {
        assert.equal(added.isError, false, added.content);
        assert.equal(JSON.parse(added.content).created[0].id, 'Review');
        return [
          call('bpmn_delete_elements', { ids: ['Flow_2'] }),
          call('bpmn_connect', { connections: [{ source: 'Pack', target: 'Review' }, { source: 'Review', target: 'Ship', name: 'approved', id: 'Flow_Approved' }] })
        ];
      },
      ([deleted, connected]) => {
        assert.equal(deleted.isError, false, deleted.content);
        assert.equal(connected.isError, false, connected.content);
        return [call('bpmn_update_elements', { updates: [{ id: 'Ship', name: 'Ship parcel' }, { id: 'Review', properties: { documentation: 'Check the items' } }] })];
      },
      ([updated]) => {
        assert.equal(updated.isError, false, updated.content);
        return [call('bpmn_get_elements', { ids: ['Review', 'Flow_Approved'] }), call('bpmn_lint', {})];
      },
      ([elements, lint]) => {
        const [review, flow] = JSON.parse(elements.content).elements;
        assert.equal(review.documentation[0].text, 'Check the items');
        assert.deepEqual([flow.sourceRef, flow.targetRef, flow.name], ['Review', 'Ship', 'approved']);
        assert.ok(Array.isArray(JSON.parse(lint.content).problems));
        return [call('bpmn_summarize_changes', { title: 'Add review step before shipping', details: ['Add task Review order between Pack order and Ship', 'Rename Ship order to Ship parcel'] })];
      },
      ([summarized]) => {
        assert.equal(summarized.isError, false, summarized.content);
        return [{ text: 'Done: the review step is in place.' }];
      }
    );
    await send('pls add a reveiw step before shiping!!');

    assert.ok(await has('Review'));
    assert.equal(await has('Flow_2'), false);
    assert.equal(await label('Ship'), 'Ship parcel');
    assert.ok(await marked('Review', 'diff-added'));
    assert.ok(await marked('Ship', 'diff-changed'));
    const text = await lastReply();
    assert.match(text, /Adding a review step\. Done: the review step is in place\./);
    assert.match(text, /Changed the diagram: 3 added · 1 changed/);
    assert.match(text, /tokens in · .* out/);
    assert.ok(await page.eval(`document.getElementById('banner').classList.contains('show')`));
    assert.match(await page.eval(`document.getElementById('bannerMsg').textContent`), /Add review step before shipping/);

    // Undo from the chat line: back to the diagram before the turn, through the undo history
    await page.eval(`[...document.querySelectorAll('[data-proposal="undo"]')].at(-1).click()`);
    await page.waitFor(`!document.querySelector('.djs-element[data-element-id="Review"]')`, { what: 'the proposal to be undone' });
    assert.ok(await has('Flow_2'));
    assert.equal(await label('Ship'), 'Ship order');
    assert.match(await lastReply(), /Undone/);
    assert.equal(await page.eval(`document.getElementById('banner').classList.contains('show')`), false);
    assert.equal(await page.eval(`document.querySelectorAll('.diff-added').length`), 0);
  });

  it('reports bad tool input to the model, describes edits it did not summarize, and Keep keeps them', async () => {
    script.push(
      () => [call('bpmn_add_elements', { elements: [{ type: 'bpmn:Nonsense' }] }), call('bpmn_replace_xml', { xml: '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"><bpmn:fantasy /></bpmn:process></bpmn:definitions>' })],
      ([bad, badXml]) => {
        assert.equal(bad.isError, true);
        assert.match(bad.content, /Unknown BPMN type: bpmn:Nonsense/);
        assert.equal(badXml.isError, true);
        assert.match(badXml.content, /^Not applied:/);
        return [call('bpmn_add_elements', { elements: [{ id: 'Notify', type: 'bpmn:SendTask', name: 'Notify customer' }] })];
      },
      ([added]) => {
        assert.equal(added.isError, false, added.content);
        return [{ text: 'Added a notification.' }];
      }
    );
    await send('also tell the customer');
    assert.ok(await has('Notify'));
    assert.match(await lastReply(), /Changed the diagram: 1 added/);
    // Keep from the banner
    await page.eval(`[...document.querySelectorAll('#bannerActions button')].find((b) => b.textContent === 'Keep').click()`);
    await page.waitFor(`!document.querySelector('.diff-added')`, { what: 'the highlights to go' });
    assert.match(await lastReply(), /Kept: 1 added/);
    assert.ok(await has('Notify'));
  });

  it('replaces the whole diagram only with valid XML, and Undo restores the copy from before', async () => {
    const xml = orderProcess({ packName: 'Pack box' });
    script.push(
      () => [call('bpmn_replace_xml', { xml })],
      ([replaced]) => {
        assert.equal(replaced.isError, false, replaced.content);
        assert.equal(JSON.parse(replaced.content).replaced, true);
        return [{ text: 'Replaced.' }];
      }
    );
    await send('rewrite it');
    assert.equal(await label('Pack'), 'Pack box');
    assert.equal(await has('Notify'), false);
    assert.match(await lastReply(), /Changed the diagram: .*1 changed.*1 removed/);
    await page.eval(`[...document.querySelectorAll('[data-proposal="undo"]')].at(-1).click()`);
    await page.waitFor(`document.querySelector('.djs-element[data-element-id="Notify"]')`, { what: 'the copy to be restored' });
    assert.equal(await label('Pack'), 'Pack order');
  });

  it('lays out through modeling, and saving uses the combined note, which stays editable', async () => {
    script.push(
      () => [call('bpmn_auto_layout', {})],
      ([layout]) => {
        assert.equal(layout.isError, false, layout.content);
        assert.ok(JSON.parse(layout.content).moved >= 1);
        return [call('bpmn_export_svg', {}), call('bpmn_summarize_changes', { title: 'Tidy up the layout', details: ['Arrange all elements left to right'] })];
      },
      ([svg]) => {
        assert.match(svg.content, /^<\?xml|<svg/);
        return [{ text: 'The layout is tidy now.' }];
      }
    );
    await send('make it look nice');
    assert.match(await lastReply(), /Changed the diagram/);

    await page.eval(`document.getElementById('save').click()`);
    await page.waitFor(`document.getElementById('saveDialog').open`, { what: 'the save dialog' });
    const note = await page.eval(`document.getElementById('saveNote').value`);
    assert.equal(note, "AI: Add send task 'Notify customer'; Tidy up the layout\n- Add send task 'Notify customer'\n- Arrange all elements left to right");
    assert.doesNotMatch(note, /tell the customer|look nice/, 'the raw prompts stay in the chat');
    await page.eval(`(() => {
      document.getElementById('saveNote').value += '\\n- Checked by hand';
      document.getElementById('saveConfirm').click();
    })()`);
    await page.waitFor(`document.getElementById('status').textContent === 'All changes saved'`, { what: 'the save' });
    const history = (await server.request('GET', `/api/projects/${projectId}/history`)).body;
    assert.equal(history[0].note, `${note}\n- Checked by hand`);
    assert.equal(await page.eval(`document.querySelectorAll('.diff-added, .diff-changed, .diff-moved').length`), 0);

    // the next save without AI changes needs no note
    assert.equal((await server.request('GET', `/api/projects/${projectId}`)).body.dirty, false);
  });

  it('had no errors in the page', () => {
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.dialogs, []);
  });
});
