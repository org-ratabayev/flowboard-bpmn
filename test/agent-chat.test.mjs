// Chat with an AI provider through the server's agent loop. A local stand-in speaks the Anthropic
// streaming protocol and plays back scripted replies; the tests play the browser that runs the
// tools and posts their results.

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { answer, browser, chatPath } from './helpers/chat.mjs';
import { request, sleep, startServer } from './helpers/server.mjs';

const USER_KEY = 'sk-ant-good-chat-key-for-tests-4242';
const TEAM_KEY = 'server-held-team-key-for-tests-7777';
const LEAKY_KEY = 'server-held-key-the-provider-echoes-5555'; // its model list fails with the key in the message
const POSTGRES = process.env.TEST_STORAGE === 'postgres';
const TOOL_TIMEOUT_MS = 1000;

// ---- the provider stand-in --------------------------------------------------------------------

const replies = []; // scripted replies, one per /v1/messages request
const calls = []; // what the provider was sent: { key, body, aborted }

const sse = (res, data) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);

function start(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  sse(res, { type: 'message_start', message: { usage: { input_tokens: 11 } } });
}
function finish(res, stopReason) {
  sse(res, { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 3 } });
  sse(res, { type: 'message_stop' });
  res.end();
}
const text = (t) => (res) => {
  start(res);
  sse(res, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  sse(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } });
  sse(res, { type: 'content_block_stop', index: 0 });
  finish(res, 'end_turn');
};
const tool = (id, name, input = {}) => (res) => {
  start(res);
  sse(res, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } });
  sse(res, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } });
  sse(res, { type: 'content_block_stop', index: 0 });
  finish(res, 'tool_use');
};
/** Starts answering, then never finishes (until the server hangs up). */
const hang = (res) => {
  start(res);
  sse(res, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  sse(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Thinking' } });
};

const provider = http.createServer(async (req, res) => {
  const key = req.headers['x-api-key'];
  if (req.method === 'GET') { // key check when a key is saved, and model lists
    if (key === LEAKY_KEY) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: `upstream failed for key ${key}` } }));
    }
    const known = key === USER_KEY || key === TEAM_KEY;
    res.writeHead(known ? 200 : 401, { 'content-type': 'application/json' });
    const models = ['claude-test', 'text-embedding-test', 'claude-other', 'claude-test'].map((id) => ({ id }));
    return res.end(JSON.stringify(known ? { data: models } : { error: { message: 'invalid x-api-key' } }));
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const call = { key, body: JSON.parse(raw), aborted: false };
  calls.push(call);
  res.on('close', () => { if (!res.writableFinished) call.aborted = true; });
  const reply = replies.shift();
  if (!reply) {
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'no scripted reply' } }));
  }
  reply(res);
});

// ---- tests -----------------------------------------------------------------------------------

let server;
let providerUrl;
let ann;
let projectId;

before(async () => {
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  providerUrl = `http://127.0.0.1:${provider.address().port}`;
  server = await startServer({
    LLM_MODE: 'managed',
    TEAM_LLM_KEY: TEAM_KEY,
    LEAKY_LLM_KEY: LEAKY_KEY,
    CHAT_TOOL_TIMEOUT_MS: String(TOOL_TIMEOUT_MS),
    CHAT_TURNS_PER_MINUTE: '0', // these tests send many messages; the limit has its own test
    // a fixed secret, so that a second instance on the same database can be started
    APP_SECRET: 'agent-chat-test-secret-'.padEnd(48, 'x'),
    LLM_PROVIDERS: JSON.stringify([
      { id: 'anthropic', label: 'Anthropic', type: 'anthropic', baseUrl: providerUrl, models: ['claude-test', 'claude-other'], credentials: { from: 'user-key' } },
      { id: 'team', label: 'Team models', type: 'anthropic', baseUrl: providerUrl, models: ['claude-test'], credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } },
      { id: 'listed', label: 'Listed models', type: 'anthropic', baseUrl: providerUrl, credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } },
      { id: 'leaky', label: 'Leaky models', type: 'anthropic', baseUrl: providerUrl, credentials: { from: 'server', secretEnv: 'LEAKY_LLM_KEY' } }
    ])
  });
  ann = await browser(server, 'Ann');
  assert.equal((await ann.call('PUT', '/api/llm/keys/anthropic', { key: USER_KEY })).status, 200);
});
after(async () => {
  await server?.stop();
  provider.close();
});
beforeEach(async () => {
  replies.length = 0;
  calls.length = 0;
  projectId = (await ann.call('POST', '/api/projects', { name: `Chat ${Math.random()}` })).body.id;
});

async function newConversation(b = ann, body = {}) {
  const res = await b.call('POST', chatPath(projectId), body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

describe('chat conversations', () => {
  it('are created with the provider and model of the catalog, and listed per user and document', async () => {
    const first = await newConversation();
    assert.equal(first.providerId, 'anthropic');
    assert.equal(first.model, 'claude-test');
    assert.equal(first.title, '');
    const second = await newConversation(ann, { providerId: 'team', title: 'Ideas' });
    assert.equal(second.providerId, 'team');

    assert.equal((await ann.call('POST', chatPath(projectId), { providerId: 'nope' })).status, 400);
    assert.equal((await ann.call('POST', chatPath(projectId), { model: 'gpt-something' })).status, 400);

    const listed = (await ann.call('GET', chatPath(projectId))).body;
    assert.deepEqual(listed.map((c) => c.id).sort(), [first.id, second.id].sort());

    const changed = await ann.call('PATCH', chatPath(projectId, `/${first.id}`), { title: 'Renamed', model: 'claude-other' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.title, 'Renamed');
    assert.equal(changed.body.model, 'claude-other');

    assert.equal((await ann.call('DELETE', chatPath(projectId, `/${second.id}`))).status, 204);
    assert.equal((await ann.call('GET', chatPath(projectId, `/${second.id}`))).status, 404);
  });

  it('are private to their user and need access to the document', async () => {
    const conversation = await newConversation();
    const bob = await browser(server, 'Bob');
    assert.equal((await bob.call('GET', chatPath(projectId))).status, 404); // no access to the project at all
    await server.grant(projectId, 'Bob', 'editor', 'Ann');
    assert.deepEqual((await bob.call('GET', chatPath(projectId))).body, []);
    assert.equal((await bob.call('GET', chatPath(projectId, `/${conversation.id}`))).status, 404);
    assert.equal((await bob.turn(projectId, conversation.id, 'Hi')).status, 404);
    assert.equal((await bob.call('POST', chatPath(projectId, `/${conversation.id}/tool-results`), { turnId: crypto.randomUUID(), toolCallId: 'x', content: '' })).status, 404);
    assert.equal((await server.anonymous('GET', chatPath(projectId))).status, 401);
  });
});

describe('a chat turn', () => {
  it('runs browser tools and keeps the history for the next turn', async () => {
    const conversation = await newConversation();
    replies.push(tool('toolu_1', 'bpmn_get_summary'), text('There is one task.'));
    const first = await ann.turn(projectId, conversation.id, 'What is in my diagram?', {
      onEvent: async (e) => {
        if (e.event === 'tool_request') assert.equal((await answer(ann, projectId, conversation.id, e, '{"tasks":1}')).status, 200);
      }
    });
    assert.equal(first.status, 200);
    assert.deepEqual(first.events.map((e) => e.event), ['turn', 'usage', 'tool_request', 'tool_result', 'text', 'usage', 'done']);
    const request = first.events.find((e) => e.event === 'tool_request');
    assert.deepEqual({ name: request.name, input: request.input, id: request.id }, { name: 'bpmn_get_summary', input: {}, id: 'toolu_1' });
    assert.deepEqual(first.events.at(-1), { event: 'done', stopReason: 'end', usage: { inputTokens: 22, outputTokens: 6 } });

    // what the provider got: the system prompt, all tools for an owner, the user's key
    assert.equal(calls[0].key, USER_KEY);
    assert.match(calls[0].body.system, /BPMN 2\.0 modeling assistant/);
    assert.equal(calls[0].body.model, 'claude-test');
    assert.ok(calls[0].body.tools.some((t) => t.name === 'bpmn_add_elements'));
    assert.deepEqual(calls[1].body.messages.at(-1), { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"tasks":1}' }] });

    // a late or repeated answer is refused
    assert.equal((await answer(ann, projectId, conversation.id, request, 'again')).status, 409);

    const stored = (await ann.call('GET', chatPath(projectId, `/${conversation.id}`))).body;
    assert.equal(stored.title, 'What is in my diagram?');
    assert.deepEqual(stored.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
    assert.deepEqual(stored.turns.map((t) => t.status), ['done']);

    replies.push(text('Still one task.'));
    const second = await ann.turn(projectId, conversation.id, 'And now?');
    assert.equal(second.events.at(-1).event, 'done');
    assert.deepEqual(calls[2].body.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user']);
    assert.deepEqual(calls[2].body.messages.at(-1).content, [{ type: 'text', text: 'And now?' }]);
  });

  it('never stores, logs or returns the key', async () => {
    const conversation = await newConversation();
    replies.push((res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `key ${USER_KEY} was revoked` } }));
    });
    const failed = await ann.turn(projectId, conversation.id, 'Hi');
    assert.deepEqual(failed.events.at(-1), { event: 'error', message: 'Anthropic API: key [redacted] was revoked' });
    replies.push(text('Hello'));
    const ok = await ann.turn(projectId, conversation.id, 'Hi again');
    assert.equal(calls.at(-1).key, USER_KEY);

    const stored = await ann.call('GET', chatPath(projectId, `/${conversation.id}`));
    for (const text of [failed.raw, ok.raw, JSON.stringify(stored.body), server.output()]) assert.ok(!text.includes(USER_KEY));
    if (!POSTGRES) {
      for (const file of ['flowboard.sqlite', 'flowboard.sqlite-wal']) {
        const data = await fs.readFile(path.join(server.dataDir, file)).catch(() => Buffer.alloc(0));
        assert.ok(!data.includes(USER_KEY), file);
      }
    }
  });

  it('needs a saved key in this browser for personal providers', async () => {
    const conversation = await newConversation();
    const elsewhere = await browser(server, 'Ann'); // the same user in another browser: no keyring
    const res = await elsewhere.turn(projectId, conversation.id, 'Hi');
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'provider-unavailable');
    assert.equal(calls.length, 0);
  });

  it('limits the prompt size', async () => {
    const conversation = await newConversation();
    assert.equal((await ann.turn(projectId, conversation.id, 'x'.repeat(64 * 1024 + 1))).status, 413);
    assert.equal((await ann.turn(projectId, conversation.id, '   ')).status, 400);
  });

  it('tells the model when the editor does not answer in time', async () => {
    const conversation = await newConversation();
    replies.push(tool('toolu_t', 'bpmn_get_xml'), text('The editor did not answer.'));
    const started = Date.now();
    const res = await ann.turn(projectId, conversation.id, 'Show the XML');
    assert.ok(Date.now() - started >= TOOL_TIMEOUT_MS);
    assert.ok(res.events.some((e) => e.event === 'tool_result' && e.status === 'timeout'));
    const result = calls[1].body.messages.at(-1).content[0];
    assert.equal(result.is_error, true);
    assert.match(result.content, /did not answer in time/);
  });

  it('runs only one turn per conversation, and can be cancelled', async () => {
    const conversation = await newConversation();
    replies.push(hang);
    let turnId;
    const running = ann.turn(projectId, conversation.id, 'Think hard', { onEvent: (e) => { if (e.event === 'turn') turnId = e.turnId; } });
    while (!calls.length) await sleep(10);
    const second = await ann.turn(projectId, conversation.id, 'Hello?');
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'turn-running');

    const cancel = await ann.call('POST', chatPath(projectId, `/${conversation.id}/turns/${turnId}/cancel`));
    assert.equal(cancel.status, 202);
    const done = await running;
    assert.equal(done.events.at(-1).event, 'cancelled');
    for (let i = 0; i < 100 && !calls[0].aborted; i++) await sleep(10);
    assert.equal(calls[0].aborted, true);
    assert.equal((await ann.call('POST', chatPath(projectId, `/${conversation.id}/turns/${turnId}/cancel`))).status, 404);

    const stored = (await ann.call('GET', chatPath(projectId, `/${conversation.id}`))).body;
    assert.equal(stored.turns.at(-1).status, 'cancelled');
    replies.push(text('Back again'));
    assert.equal((await ann.turn(projectId, conversation.id, 'Hello?')).events.at(-1).event, 'done');
  });

  it('stops when the browser disconnects', async () => {
    const conversation = await newConversation();
    replies.push(hang);
    const controller = new AbortController();
    const running = ann.turn(projectId, conversation.id, 'Think hard', { controller });
    while (!calls.length) await sleep(10);
    controller.abort();
    await running;
    for (let i = 0; i < 100 && !calls[0].aborted; i++) await sleep(10);
    assert.equal(calls[0].aborted, true);
    let status;
    for (let i = 0; i < 100 && status !== 'cancelled'; i++) {
      status = (await ann.call('GET', chatPath(projectId, `/${conversation.id}`))).body.turns.at(-1).status;
      await sleep(10);
    }
    assert.equal(status, 'cancelled');
  });
});

describe('chat and roles', () => {
  it('gives viewers read-only tools and refuses edit tools even when the model calls them', async () => {
    await server.grant(projectId, 'Vic', 'viewer', 'Ann');
    const vic = await browser(server, 'Vic');
    const conversation = await newConversation(vic, { providerId: 'team' });
    replies.push(tool('toolu_d', 'bpmn_delete_elements', { ids: ['Activity_1'] }), text('You can only view this diagram.'));
    const res = await vic.turn(projectId, conversation.id, 'Delete the task', {
      onEvent: (e) => assert.notEqual(e.event, 'tool_request')
    });
    assert.equal(calls[0].key, TEAM_KEY);
    const names = calls[0].body.tools.map((t) => t.name);
    assert.ok(names.includes('bpmn_get_summary'));
    assert.ok(!names.some((n) => ['bpmn_add_elements', 'bpmn_update_elements', 'bpmn_delete_elements', 'bpmn_connect', 'bpmn_replace_xml', 'bpmn_auto_layout'].includes(n)));
    assert.ok(res.events.some((e) => e.event === 'tool_result' && e.status === 'refused'));
    const result = calls[1].body.messages.at(-1).content[0];
    assert.equal(result.is_error, true);
    assert.match(result.content, /needs edit access/);
  });

  it('offers bpmn_summarize_changes only together with the edit tools', async () => {
    const owners = await newConversation(ann, { providerId: 'team' });
    replies.push(text('Hi'));
    await ann.turn(projectId, owners.id, 'Hello');
    assert.ok(calls[0].body.tools.some((t) => t.name === 'bpmn_summarize_changes'));
    assert.match(calls[0].body.system, /call bpmn_summarize_changes exactly once/);

    await server.grant(projectId, 'Vic', 'viewer', 'Ann');
    const vic = await browser(server, 'Vic');
    const viewers = await newConversation(vic, { providerId: 'team' });
    replies.push(text('Hi'));
    await vic.turn(projectId, viewers.id, 'Hello');
    assert.ok(!calls[1].body.tools.some((t) => t.name === 'bpmn_summarize_changes'));
  });

  it('follows a role change in the middle of a turn', async () => {
    await server.grant(projectId, 'Eve', 'editor', 'Ann');
    const eve = await browser(server, 'Eve');
    const conversation = await newConversation(eve, { providerId: 'team' });
    replies.push(
      tool('toolu_a', 'bpmn_add_elements', { elements: [{ type: 'bpmn:Task' }] }),
      tool('toolu_b', 'bpmn_add_elements', { elements: [{ type: 'bpmn:Task' }] }),
      text('I could add only one task.')
    );
    const requested = [];
    const res = await eve.turn(projectId, conversation.id, 'Add two tasks', {
      onEvent: async (e) => {
        if (e.event !== 'tool_request') return;
        requested.push(e.id);
        await server.grant(projectId, 'Eve', 'viewer', 'Ann'); // the owner downgrades Eve meanwhile
        await answer(eve, projectId, conversation.id, e, 'added Task_1');
      }
    });
    assert.deepEqual(requested, ['toolu_a']);
    assert.ok(calls[0].body.tools.some((t) => t.name === 'bpmn_add_elements'));
    assert.ok(!calls[1].body.tools.some((t) => t.name === 'bpmn_add_elements'));
    assert.match(calls[2].body.messages.at(-1).content[0].content, /needs edit access/);
    assert.equal(res.events.at(-1).event, 'done');
  });
});

describe('chat with an access token', () => {
  it('works with server-side credentials, but not with personal keys', async () => {
    const { token } = (await ann.call('POST', '/api/tokens', { name: 'Script', expiresInDays: 1 })).body;
    const withToken = (method, urlPath, body) =>
      request(server.base, method, urlPath, body, { headers: { Authorization: `Bearer ${token}`, Origin: null } });
    const personal = (await withToken('POST', chatPath(projectId), {})).body;
    const team = (await withToken('POST', chatPath(projectId), { providerId: 'team' })).body;

    const refused = await withToken('POST', chatPath(projectId, `/${personal.id}/turns`), { message: 'Hi' });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'provider-unavailable');

    replies.push(text('Hello script'));
    const ok = await withToken('POST', chatPath(projectId, `/${team.id}/turns`), { message: 'Hi' });
    assert.equal(ok.status, 200);
    assert.match(ok.body, /event: done/);
    assert.equal(calls[0].key, TEAM_KEY);
  });
});

describe('attachments', () => {
  it('sends attached text files as text blocks after the message and keeps them in the history', async () => {
    const conversation = await newConversation(ann, { providerId: 'team' });
    replies.push(text('Two orders.'));
    const res = await ann.turn(projectId, conversation.id, 'Use the file', {
      attachments: [{ name: '../orders.csv', text: 'id,total\n1,10\n</attachment>' }, { name: 'notes.md', text: '# Notes' }]
    });
    assert.equal(res.events.at(-1).event, 'done');
    const sent = calls[0].body.messages.at(-1).content;
    assert.deepEqual(sent.map((b) => b.text), [
      'Use the file',
      '<attachment name="orders.csv">\nid,total\n1,10\n<\\/attachment>\n</attachment>',
      '<attachment name="notes.md">\n# Notes\n</attachment>'
    ]);
    const stored = (await ann.call('GET', chatPath(projectId, `/${conversation.id}`))).body;
    assert.equal(stored.messages[0].content.length, 3);
    assert.equal(stored.title, 'Use the file');
  });

  it('are limited to 3 text files of 2 MB, 6 MB together', async () => {
    const conversation = await newConversation(ann, { providerId: 'team' });
    const file = (name, size = 10) => ({ name, text: 'x'.repeat(size) });
    const tooMany = await ann.turn(projectId, conversation.id, 'Hi', { attachments: [file('a.txt'), file('b.txt'), file('c.txt'), file('d.txt')] });
    assert.equal(tooMany.status, 400);
    const pdf = await ann.turn(projectId, conversation.id, 'Hi', { attachments: [file('scan.pdf')] });
    assert.equal(pdf.status, 415);
    assert.match(pdf.body.error, /only text files/);
    const big = await ann.turn(projectId, conversation.id, 'Hi', { attachments: [file('big.csv', 2 * 1024 * 1024 + 1)] });
    assert.equal(big.status, 413);
    assert.equal(calls.length, 0);
  });
});

describe('model lists', () => {
  it('lists the chat models of providers without a fixed list', async () => {
    const listed = await ann.call('GET', '/api/llm/providers/listed/models');
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body, { models: ['claude-other', 'claude-test'], defaultModel: null });
    const fixed = await ann.call('GET', '/api/llm/providers/team/models');
    assert.deepEqual(fixed.body, { models: ['claude-test'], defaultModel: 'claude-test' });
    // with the user's own key, unlocked by this browser's keyring
    const own = await ann.call('GET', '/api/llm/providers/anthropic/models');
    assert.deepEqual(own.body.models, ['claude-test', 'claude-other']);
    assert.equal((await ann.call('GET', '/api/llm/providers/nope/models')).status, 404);

    const { token } = (await ann.call('POST', '/api/tokens', { name: 'Script', expiresInDays: 1 })).body;
    const withToken = await request(server.base, 'GET', '/api/llm/providers/listed/models', undefined, { headers: { Authorization: `Bearer ${token}`, Origin: null } });
    assert.equal(withToken.status, 403);
  });

  it('never return the key when the provider fails to list models', async () => {
    const failed = await ann.call('GET', '/api/llm/providers/leaky/models');
    assert.equal(failed.status, 502);
    assert.match(failed.body.error, /Could not list the models of Leaky models: .*\[redacted\]/);
    assert.ok(!JSON.stringify(failed.body).includes(LEAKY_KEY));
  });

  it('accept any model name for such providers', async () => {
    const conversation = await newConversation(ann, { providerId: 'listed', model: 'claude-other' });
    assert.equal(conversation.model, 'claude-other');
    assert.equal((await ann.call('POST', chatPath(projectId), { providerId: 'listed' })).status, 400);
  });
});

describe('rate limit', () => {
  it('allows CHAT_TURNS_PER_MINUTE messages per user and minute', async () => {
    const limited = await startServer({
      CHAT_TURNS_PER_MINUTE: '2',
      TEAM_LLM_KEY: TEAM_KEY,
      LLM_MODE: 'managed',
      LLM_PROVIDERS: JSON.stringify([
        { id: 'team', label: 'Team models', type: 'anthropic', baseUrl: providerUrl, models: ['claude-test'], credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } }
      ])
    });
    try {
      const amy = await browser(limited, 'Amy');
      const project = (await amy.call('POST', '/api/projects', { name: 'Limited' })).body.id;
      const conversation = (await amy.call('POST', chatPath(project), {})).body;
      replies.push(text('One'), text('Two'));
      assert.equal((await amy.turn(project, conversation.id, 'One')).events.at(-1).event, 'done');
      assert.equal((await amy.turn(project, conversation.id, 'Two')).events.at(-1).event, 'done');
      const third = await amy.turn(project, conversation.id, 'Three');
      assert.equal(third.status, 429);
      assert.equal(third.body.code, 'rate-limited');
      const retryAfter = Number(third.headers.get('retry-after'));
      assert.ok(retryAfter >= 1 && retryAfter <= 60, String(retryAfter));
      assert.equal(third.body.retryAfterSeconds, retryAfter);
      assert.equal(calls.length, 2);

      // another user has their own budget
      const ben = await browser(limited, 'Ben');
      const own = (await ben.call('POST', '/api/projects', { name: 'Ben' })).body.id;
      const theirs = (await ben.call('POST', chatPath(own), {})).body;
      replies.push(text('Hi Ben'));
      assert.equal((await ben.turn(own, theirs.id, 'Hi')).events.at(-1).event, 'done');
    } finally {
      await limited.stop();
    }
  });
});

describe('several server instances', () => {
  // SQLite instances share the database file; Postgres instances would also share NOTIFY, which
  // PGlite (one session) cannot provide: that path is covered by chat/crossInstance.test.ts.
  it(POSTGRES ? 'are covered by unit tests with Postgres' : 'continue a turn when the tool result reaches another instance', { skip: POSTGRES }, async () => {
    const second = await startServer({
      SQLITE_PATH: path.join(server.dataDir, 'flowboard.sqlite'),
      APP_SECRET: 'agent-chat-test-secret-'.padEnd(48, 'x'),
      CHAT_TOOL_TIMEOUT_MS: '10000',
      CHAT_TURNS_PER_MINUTE: '0',
      TEAM_LLM_KEY: TEAM_KEY,
      LLM_MODE: 'managed',
      LLM_PROVIDERS: JSON.stringify([
        { id: 'team', label: 'Team models', type: 'anthropic', baseUrl: providerUrl, models: ['claude-test'], credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } }
      ])
    });
    try {
      const annOnSecond = await browser(second, 'Ann');
      const conversation = await newConversation(annOnSecond, { providerId: 'team' });
      replies.push(tool('toolu_x', 'bpmn_lint'), text('No problems.'));
      const res = await annOnSecond.turn(projectId, conversation.id, 'Lint it', {
        // the browser's answer goes to the first instance
        onEvent: async (e) => { if (e.event === 'tool_request') assert.equal((await answer(ann, projectId, conversation.id, e, '[]')).status, 200); }
      });
      assert.equal(res.events.at(-1).event, 'done');
      assert.deepEqual(calls[1].body.messages.at(-1).content, [{ type: 'tool_result', tool_use_id: 'toolu_x', content: '[]' }]);
    } finally {
      await second.stop();
    }
  });
});
