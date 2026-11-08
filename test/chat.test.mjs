// The Claude Code CLI as a chat provider (development only), through the chat API, with
// test/fixtures/fake-claude.mjs in place of the real CLI. The test plays the editor: it answers
// bpmn_get_xml with the diagram and accepts (or rejects) the bpmn_replace_xml that follows.

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { answer, browser, chatPath } from './helpers/chat.mjs';
import { diagram, startServer } from './helpers/server.mjs';

let server;
let log;
let ann;
let projectId;

before(async () => {
  log = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'fake-claude-')), 'calls.jsonl');
  server = await startServer({ CHAT_CLAUDE_CODE: 'on', LLM_MODE: 'managed', LLM_PROVIDERS: '[]', FAKE_CLAUDE_LOG: log });
  ann = await browser(server, 'Ann');
});
after(async () => {
  await server?.stop();
  await fs.rm(path.dirname(log), { recursive: true, force: true });
});
beforeEach(async () => {
  await fs.rm(log, { force: true });
  projectId = (await ann.call('POST', '/api/projects', { name: `CLI ${Math.random()}` })).body.id;
});

const calls = async () => (await fs.readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

async function conversation(b = ann) {
  const res = await b.call('POST', chatPath(projectId), {});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

/** Runs a turn, answering the tool requests like the editor: `onReplace(xml)` returns [content, isError]. */
function turn(b, cid, message, { onReplace = () => ['applied', false] } = {}) {
  return b.turn(projectId, cid, message, {
    onEvent: async (e) => {
      if (e.event !== 'tool_request') return;
      if (e.name === 'bpmn_get_xml') await answer(b, projectId, cid, e, diagram('Current'));
      else if (e.name === 'bpmn_replace_xml') await answer(b, projectId, cid, e, ...onReplace(e.input.xml));
      else assert.fail(`unexpected tool ${e.name}`);
    }
  });
}

describe('Claude Code CLI provider', () => {
  it('is offered as a provider of the catalog, ready without a key', async () => {
    const { body } = await ann.call('GET', '/api/llm/providers');
    assert.deepEqual(body.providers.map((p) => [p.id, p.type, p.credentials, p.ready]), [['claude-code', 'claude-code-cli', 'local', true]]);
    const c = await conversation();
    assert.equal(c.providerId, 'claude-code');
    assert.equal(c.model, 'default');
  });

  it('answers a question with the current diagram and a locked-down CLI, without changing it', async () => {
    const c = await conversation();
    const { events } = await turn(ann, c.id, 'What does this process do?');
    assert.deepEqual(events.filter((e) => e.event === 'tool_request').map((e) => e.name), ['bpmn_get_xml']);
    assert.equal(events.filter((e) => e.event === 'text').map((e) => e.text).join(''), 'Just an answer');
    const done = events.at(-1);
    assert.equal(done.event, 'done');
    assert.deepEqual(done.usage, { inputTokens: 120, outputTokens: 30, costUsd: 0.01 });

    const [call] = await calls();
    assert.equal(call.diagram, diagram('Current'));
    assert.equal(call.prompt, 'What does this process do?');
    const flags = ['-p', '--output-format', 'json', '--restricted', '--strict-mcp-config', '--tools', 'Read,Edit,Write,Glob,Grep',
      '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--disable-slash-commands', '--append-system-prompt'];
    assert.deepEqual(call.args.slice(0, flags.length), flags);
    assert.match(call.args[flags.length], /BPMN 2\.0 modeling assistant/);
    assert.ok(!call.args.includes('--model'), 'model "default" leaves the choice to the CLI');
    assert.ok(!call.args.includes('--resume'));
    // the working copy is removed after the call
    await assert.rejects(fs.access(call.cwd));
  });

  it('hands a changed diagram to the editor as bpmn_replace_xml', async () => {
    const c = await conversation();
    let replaced = null;
    const { events } = await turn(ann, c.id, 'ADD_TASK please', { onReplace: (xml) => { replaced = xml; return ['applied', false]; } });
    assert.match(replaced, /<bpmn:task id="Activity_Added" name="Added" \/>/);
    assert.equal(events.filter((e) => e.event === 'text').map((e) => e.text).join(''), 'Added a task');
    assert.deepEqual(events.filter((e) => e.event === 'tool_result').map((e) => [e.name, e.status]), [['bpmn_get_xml', 'done'], ['bpmn_replace_xml', 'done']]);
    assert.equal(events.at(-1).event, 'done');
  });

  it('tells the user when the editor rejected the result', async () => {
    const c = await conversation();
    const { events } = await turn(ann, c.id, 'BREAK it', { onReplace: () => ['Not applied: Not BPMN: there is no definitions element', true] });
    assert.equal(events.filter((e) => e.event === 'text').map((e) => e.text).join(''),
      'Broke the diagram\n\nThe editor could not apply the change: Not applied: Not BPMN: there is no definitions element');
    assert.equal(events.at(-1).event, 'done');
  });

  it('sends earlier turns as a transcript', async () => {
    const c = await conversation();
    await turn(ann, c.id, 'Hello');
    await turn(ann, c.id, 'And now?');
    const second = (await calls()).at(-1);
    assert.equal(second.prompt, 'Conversation so far:\nUser: Hello\n\nAssistant: Just an answer\n\nCurrent request:\n\nAnd now?');
  });

  it('includes attached text files in the prompt', async () => {
    const c = await conversation();
    await ann.turn(projectId, c.id, 'See the file', {
      attachments: [{ name: 'notes.md', text: '# Notes' }],
      onEvent: async (e) => { if (e.event === 'tool_request') await answer(ann, projectId, c.id, e, diagram()); }
    });
    assert.equal((await calls())[0].prompt, 'See the file\n<attachment name="notes.md">\n# Notes\n</attachment>');
  });

  it('does not let viewers change the diagram', async () => {
    await server.grant(projectId, 'Vic', 'viewer', 'Ann');
    const vic = await browser(server, 'Vic');
    const c = await conversation(vic);
    const { events } = await turn(vic, c.id, 'ADD_TASK please');
    assert.deepEqual(events.filter((e) => e.event === 'tool_request').map((e) => e.name), ['bpmn_get_xml']);
    assert.match((await calls())[0].prompt, /can only view this diagram: do not modify/);
  });

  it('reports CLI errors as turn errors', async () => {
    const c = await conversation();
    const failed = await turn(ann, c.id, 'FAIL now');
    assert.deepEqual(failed.events.at(-1), { event: 'error', message: 'Simulated failure' });
    const other = await conversation();
    const crashed = await turn(ann, other.id, 'CRASH now');
    assert.deepEqual(crashed.events.at(-1), { event: 'error', message: 'Claude Code exited with code 3: simulated crash' });
  });

  it('passes the chosen model to the CLI', async () => {
    const c = (await ann.call('POST', chatPath(projectId), { model: 'sonnet' })).body;
    await turn(ann, c.id, 'Hi');
    const [call] = await calls();
    assert.equal(call.args[call.args.indexOf('--model') + 1], 'sonnet');
  });
});

describe('chat configuration', () => {
  it('has no Claude Code CLI provider unless switched on', async () => {
    const plain = await startServer();
    try {
      const { body } = await plain.request('GET', '/api/llm/providers');
      assert.ok(!body.providers.some((p) => p.id === 'claude-code'));
      // the old CLI endpoint is gone
      const id = (await plain.request('POST', '/api/projects', {})).body.id;
      assert.equal((await plain.request('POST', `/api/projects/${id}/chat`, { message: 'Hi', xml: diagram() })).status, 404);
    } finally {
      await plain.stop();
    }
  });

  it('refuses to start the CLI provider without dev sign-in', async () => {
    await assert.rejects(
      startServer({ CHAT_CLAUDE_CODE: 'on', AUTH: 'trusted-headers', AUTH_PROXY_SECRET: 'a-long-enough-proxy-secret' }),
      /needs AUTH=dev/
    );
  });

  it('can be switched off', async () => {
    const off = await startServer({ CHAT: 'off' });
    try {
      const id = (await off.request('POST', '/api/projects', {})).body.id;
      const res = await off.request('GET', `/api/projects/${id}/chat/conversations`);
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: 'Chat is disabled on this server' });
    } finally {
      await off.stop();
    }
  });
});
