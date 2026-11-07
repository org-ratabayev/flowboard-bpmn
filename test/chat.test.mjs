// Characterization tests for the chat endpoint, using test/fixtures/fake-claude.mjs
// in place of the Claude Code CLI.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { diagram, startServer } from './helpers/server.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let server;
let req;
let projectId;
before(async () => {
  server = await startServer();
  req = server.request;
  projectId = (await req('POST', '/api/projects', { name: 'Chat test' })).body.id;
});
after(() => server.stop());

const chat = (body, id = projectId) => req('POST', `/api/projects/${id}/chat`, { xml: diagram('Chat'), ...body });
const readCall = async (chatId) =>
  JSON.parse(await fs.readFile(path.join(server.chatDir, chatId, 'fake-claude-call.json'), 'utf8'));
const readSession = async (chatId) =>
  JSON.parse(await fs.readFile(path.join(server.chatDir, chatId, 'session.json'), 'utf8'));

describe('chat', () => {
  it('validates the request', async () => {
    const empty = await chat({ message: '   ' });
    assert.equal(empty.status, 400);
    assert.deepEqual(empty.body, { error: 'Message is empty' });
    const noDiagram = await chat({ message: 'Hi', xml: 'not bpmn' });
    assert.equal(noDiagram.status, 400);
    assert.deepEqual(noDiagram.body, { error: 'Current diagram is missing' });
    const unknownProject = await chat({ message: 'Hi' }, 'missing');
    assert.equal(unknownProject.status, 404);
  });

  it('answers a question without changing the diagram, using a locked-down CLI', async () => {
    const res = await chat({ message: 'What does this process do?' });
    assert.equal(res.status, 200);
    assert.match(res.body.chatId, UUID_RE);
    assert.deepEqual({ ...res.body, chatId: undefined }, {
      chatId: undefined,
      reply: 'Just an answer',
      xml: null,
      costUsd: 0.01,
      provider: 'claude-code'
    });

    const call = await readCall(res.body.chatId);
    assert.equal(call.prompt, 'What does this process do?');
    const flags = ['-p', '--output-format', 'json', '--restricted', '--strict-mcp-config', '--tools', 'Read,Edit,Write,Glob,Grep',
      '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--disable-slash-commands', '--append-system-prompt'];
    assert.deepEqual(call.args.slice(0, flags.length), flags);
    assert.match(call.args[flags.length], /BPMN 2\.0 modeling assistant/);
    assert.ok(!call.args.includes('--resume'));
    assert.ok(!call.args.includes('--model'));

    const dir = path.join(server.chatDir, res.body.chatId);
    assert.equal(await fs.readFile(path.join(dir, 'diagram.bpmn'), 'utf8'), diagram('Chat'));
    assert.equal((await readSession(res.body.chatId)).projectId, projectId);
  });

  it('continues the same CLI session on follow-up messages', async () => {
    const first = await chat({ message: 'Hello' });
    const { sessionId } = await readSession(first.body.chatId);
    const second = await chat({ message: 'And now?', chatId: first.body.chatId });
    assert.equal(second.body.chatId, first.body.chatId);
    const call = await readCall(first.body.chatId);
    assert.equal(call.args[call.args.indexOf('--resume') + 1], sessionId);
  });

  it('starts a new chat when the chat id is malformed', async () => {
    const res = await chat({ message: 'Hello', chatId: '../escape' });
    assert.equal(res.status, 200);
    assert.match(res.body.chatId, UUID_RE);
  });

  it('returns the diagram the CLI changed', async () => {
    const res = await chat({ message: 'ADD_TASK please' });
    assert.equal(res.body.reply, 'Added a task');
    assert.match(res.body.xml, /<bpmn:task id="Activity_Added" name="Added" \/>/);
  });

  it('does not apply a result that is not BPMN', async () => {
    const res = await chat({ message: 'BREAK it' });
    assert.equal(res.status, 200);
    assert.equal(res.body.xml, null);
    assert.equal(res.body.reply, 'Broke the diagram\n\n(The diagram file Claude produced is not valid BPMN, so it was not applied.)');
  });

  it('reports CLI errors as 502', async () => {
    const failed = await chat({ message: 'FAIL now' });
    assert.equal(failed.status, 502);
    assert.deepEqual(failed.body, { error: 'Simulated failure' });
    const crashed = await chat({ message: 'CRASH now' });
    assert.equal(crashed.status, 502);
    assert.deepEqual(crashed.body, { error: 'Claude Code exited with code 3: simulated crash' });
  });

  it('stores attachments under safe, unique names and lists them in the prompt', async () => {
    const data = Buffer.from('hello').toString('base64');
    const res = await chat({ message: 'See files', attachments: [{ name: '../../notes.txt', data }, { name: 'notes.txt', data }, { name: 'skipped' }] });
    const dir = path.join(server.chatDir, res.body.chatId, 'attachments');
    assert.deepEqual((await fs.readdir(dir)).sort(), ['notes-2.txt', 'notes.txt']);
    assert.equal(await fs.readFile(path.join(dir, 'notes.txt'), 'utf8'), 'hello');
    const call = await readCall(res.body.chatId);
    assert.equal(call.prompt, 'See files\n\nNewly attached files:\n- ./attachments/notes.txt\n- ./attachments/notes-2.txt');
  });

  it('keeps a chat bound to its project', async () => {
    const other = (await req('POST', '/api/projects', { name: 'Other' })).body.id;
    const first = await chat({ message: 'Hello' });
    const res = await chat({ message: 'Hello', chatId: first.body.chatId }, other);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Chat belongs to another project' });
  });

  it('refuses a second message while the first is still running', async () => {
    const { chatId } = (await chat({ message: 'Hello' })).body;
    const results = await Promise.all([chat({ message: 'SLOW 1', chatId }), chat({ message: 'SLOW 2', chatId })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.deepEqual(results.find((r) => r.status === 409).body, { error: 'Claude is still working on the previous message' });
  });
});

describe('chat configuration', () => {
  it('passes CLAUDE_MODEL to the CLI', async () => {
    const custom = await startServer({ CLAUDE_MODEL: 'sonnet' });
    try {
      const id = (await custom.request('POST', '/api/projects', {})).body.id;
      const res = await custom.request('POST', `/api/projects/${id}/chat`, { message: 'Hi', xml: diagram() });
      const call = JSON.parse(await fs.readFile(path.join(custom.chatDir, res.body.chatId, 'fake-claude-call.json'), 'utf8'));
      assert.equal(call.args[call.args.indexOf('--model') + 1], 'sonnet');
    } finally {
      await custom.stop();
    }
  });

  it('can be switched off', async () => {
    const off = await startServer({ CHAT: 'off' });
    try {
      const id = (await off.request('POST', '/api/projects', {})).body.id;
      const res = await off.request('POST', `/api/projects/${id}/chat`, { message: 'Hi', xml: diagram() });
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'Chat is disabled on this server' });
    } finally {
      await off.stop();
    }
  });
});
