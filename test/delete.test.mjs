// Deleting projects: only the owner may, and only in the app (not with an access token); a soft
// delete hides the project from every route (list, project routes, sharing, share links, live,
// chat, access tokens) and tells open editors at once; a permanent delete needs the project name
// repeated and leaves nothing behind.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { browser, chatPath } from './helpers/chat.mjs';
import { diagram, openLive, startServer } from './helpers/server.mjs';

// ---- an AI provider stand-in that asks the editor for a tool and then waits -----------------

const providerCalls = [];
const provider = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'model-a' }] }));
  }
  for await (const _ of req); // eslint-disable-line no-unused-vars
  providerCalls.push(Date.now());
  const sse = (data) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  sse({ type: 'message_start', message: { usage: { input_tokens: 5 } } });
  sse({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'bpmn_get_xml', input: {} } });
  sse({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } });
  sse({ type: 'content_block_stop', index: 0 });
  sse({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 2 } });
  sse({ type: 'message_stop' });
  res.end();
});

let server;
before(async () => {
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  server = await startServer({
    LLM_MODE: 'managed',
    TEAM_LLM_KEY: 'delete-test-team-key-1234',
    CHAT_TOOL_TIMEOUT_MS: '20000', // far longer than the test waits: the delete must stop the turn
    CHAT_TURNS_PER_MINUTE: '0',
    LLM_PROVIDERS: JSON.stringify([
      { id: 'team', label: 'Team', type: 'anthropic', baseUrl: `http://127.0.0.1:${provider.address().port}`, models: ['model-a'], credentials: { from: 'server', secretEnv: 'TEAM_LLM_KEY' } }
    ])
  });
});
after(async () => {
  await server?.stop();
  provider.close();
});

const owner = () => server.as('Olivia');
let n = 0;
const client = () => `client-delete-${++n}-xxxx`;
/** A project of Olivia's, shared with Eddie (editor) and Vera (viewer). */
async function sharedProject(name) {
  const id = (await owner()('POST', '/api/projects', { name, xml: diagram(name) })).body.id;
  await server.grant(id, 'Eddie', 'editor', 'Olivia');
  await server.grant(id, 'Vera', 'viewer', 'Olivia');
  return id;
}
const listed = async (user, id) => (await server.as(user)('GET', '/api/projects')).body.some((p) => p.id === id);

describe('who may delete', () => {
  it('refuses editors and viewers (403) and people without access (404); the project stays', async () => {
    const id = await sharedProject('Not yours');
    for (const [user, status] of [['Eddie', 403], ['Vera', 403], ['Sam', 404]]) {
      for (const body of [undefined, { permanent: true, confirmName: 'Not yours' }]) {
        const res = await server.as(user)('DELETE', `/api/projects/${id}`, body);
        assert.equal(res.status, status, `${user} ${JSON.stringify(body)}`);
        if (status === 403) assert.equal(res.body.error, 'Only the owner can delete this project');
        else assert.deepEqual(res.body, { error: 'Project not found' });
      }
    }
    assert.equal((await owner()('GET', `/api/projects/${id}`)).status, 200);
    assert.ok(await listed('Eddie', id));
  });

  it('refuses a cross-site request from the owner', async () => {
    const id = await sharedProject('Cross site');
    const res = await server.anonymous('DELETE', `/api/projects/${id}`, undefined, {
      cookie: await server.signIn('Olivia'), headers: { Origin: 'https://evil.example.com' }
    });
    assert.equal(res.status, 403);
    assert.equal((await owner()('GET', `/api/projects/${id}`)).status, 200);
  });
});

describe('soft delete', () => {
  it('hides the project from everyone and every project route', async () => {
    const id = await sharedProject('Soft');
    const { version } = (await owner()('GET', `/api/projects/${id}`)).body;
    await owner()('PATCH', `/api/projects/${id}/access`, { visibility: 'everyone' });
    const eddie = await browser(server, 'Eddie');
    const conversation = (await eddie.call('POST', chatPath(id), {})).body;

    assert.equal((await owner()('DELETE', `/api/projects/${id}`)).status, 204);

    for (const user of ['Olivia', 'Eddie', 'Vera', 'Sam']) assert.equal(await listed(user, id), false, user);
    const routes = [
      ['GET', `/api/projects/${id}`],
      ['PUT', `/api/projects/${id}`, { xml: diagram('After'), force: true }],
      ['PATCH', `/api/projects/${id}`, { name: 'Renamed' }],
      ['DELETE', `/api/projects/${id}`],
      ['GET', `/api/projects/${id}/history`],
      ['GET', `/api/projects/${id}/history/${version}`],
      ['GET', `/api/projects/${id}/download`],
      ['GET', `/api/projects/${id}/access`],
      ['GET', `/api/projects/${id}/access/log`],
      ['PATCH', `/api/projects/${id}/access`, { visibility: 'private' }],
      ['POST', `/api/projects/${id}/access/links`, { role: 'viewer' }],
      ['POST', `/api/projects/${id}/access/invites`, { email: 'someone@example.com', role: 'viewer' }],
      ['POST', `/api/projects/${id}/live`, { client: 'client-none-xxxx', type: 'cursor', cursor: { x: 1, y: 1 } }],
      ['GET', `/api/projects/${id}/chat/conversations`],
      ['POST', `/api/projects/${id}/chat/conversations`, {}],
      ['GET', chatPath(id, `/${conversation.id}`)],
      ['PATCH', chatPath(id, `/${conversation.id}`), { title: 'Renamed' }],
      ['DELETE', chatPath(id, `/${conversation.id}`)],
      ['POST', chatPath(id, `/${conversation.id}/turns`), { message: 'hello' }],
      ['POST', chatPath(id, `/${conversation.id}/turns/${conversation.id}/cancel`)],
      ['POST', chatPath(id, `/${conversation.id}/tool-results`), { turnId: conversation.id, toolCallId: 'toolu_1', content: '{}' }]
    ];
    for (const user of ['Olivia', 'Eddie', 'Vera']) {
      for (const [method, path, body] of routes) {
        const res = await server.as(user)(method, path, body);
        assert.equal(res.status, 404, `${user} ${method} ${path}`);
        assert.deepEqual(res.body, { error: 'Project not found' });
      }
    }
    const live = await fetch(`${server.base}/api/projects/${id}/live?client=client-gone-xxxx`, { headers: { Cookie: await server.signIn('Eddie') } });
    assert.equal(live.status, 404);
    await live.body?.cancel();
  });

  it('shows a share link to it as no longer available', async () => {
    const id = await sharedProject('Linked');
    const link = (await owner()('POST', `/api/projects/${id}/access/links`, { role: 'viewer' })).body;
    assert.equal((await owner()('DELETE', `/api/projects/${id}`)).status, 204);
    const res = await server.as('Linda')('POST', '/api/share/join', { token: link.token });
    assert.equal(res.status, 410);
    assert.deepEqual(res.body, { error: 'The project this link points to was deleted by its owner.', reason: 'deleted' });
    assert.equal(await listed('Linda', id), false);
    // the page itself loads; join.mjs shows the notice
    assert.equal((await server.as('Linda')('GET', link.path)).status, 200);
  });

  it('cannot be done with an access token, soft or permanent; a deleted project is hidden from tokens too', async () => {
    const id = await sharedProject('Scripted');
    const { token } = (await owner()('POST', '/api/tokens', { name: 'Script', expiresInDays: 1 })).body;
    const asToken = (method, path, body) => server.anonymous(method, path, body, { headers: { Authorization: `Bearer ${token}`, Origin: null } });
    assert.equal((await asToken('GET', `/api/projects/${id}`)).status, 200);

    for (const body of [undefined, { permanent: true, confirmName: 'Scripted' }]) {
      const refused = await asToken('DELETE', `/api/projects/${id}`, body);
      assert.equal(refused.status, 403, JSON.stringify(body));
      assert.deepEqual(refused.body, { error: 'Delete projects in the app, not with a token' });
      assert.equal((await asToken('GET', `/api/projects/${id}`)).status, 200);
    }
    // an editor's token still gets the role answer first
    const { token: editorToken } = (await server.as('Eddie')('POST', '/api/tokens', { name: 'Editor script', expiresInDays: 1 })).body;
    const asEditorToken = (method, path, body) => server.anonymous(method, path, body, { headers: { Authorization: `Bearer ${editorToken}`, Origin: null } });
    assert.equal((await asEditorToken('DELETE', `/api/projects/${id}`)).status, 403);

    assert.equal((await owner()('DELETE', `/api/projects/${id}`)).status, 204);
    assert.equal((await asToken('GET', `/api/projects/${id}`)).status, 404);
    assert.equal((await asToken('GET', `/api/projects/${id}/history`)).status, 404);
    assert.ok(!(await asToken('GET', '/api/projects')).body.some((p) => p.id === id));
  });

  it('tells everyone who has it open, closes their live streams and drops the unsaved draft', async () => {
    const id = await sharedProject('Open');
    const tabs = [
      await openLive(server, id, client(), 'Olivia'),
      await openLive(server, id, client(), 'Eddie'),
      await openLive(server, id, client(), 'Vera')
    ];
    for (const tab of tabs) await tab.next('hello');
    assert.equal((await tabs[1].post({ type: 'doc', xml: diagram('Unsaved draft') })).status, 200);

    assert.equal((await owner()('DELETE', `/api/projects/${id}`)).status, 204);
    for (const tab of tabs) {
      assert.deepEqual(await tab.next('access-revoked'), { reason: 'deleted' });
      await tab.ended;
    }
    // the editor that had unsaved changes can no longer share or save them
    assert.equal((await tabs[1].post({ type: 'doc', xml: diagram('Too late') })).status, 404);
    assert.equal((await server.as('Eddie')('PUT', `/api/projects/${id}`, { xml: diagram('Too late'), force: true })).status, 404);
  });

  it('stops a chat turn that is waiting for the editor', async () => {
    const id = await sharedProject('Chatting');
    const eddie = await browser(server, 'Eddie');
    const conversation = (await eddie.call('POST', chatPath(id), {})).body;
    let requested;
    const toolRequested = new Promise((resolve) => { requested = resolve; });
    const started = Date.now();
    const turn = eddie.turn(id, conversation.id, 'Look at the diagram', { onEvent: (e) => { if (e.event === 'tool_request') requested(); } });
    await toolRequested; // the browser never answers: only the delete can end the turn early
    const calls = providerCalls.length;

    assert.equal((await owner()('DELETE', `/api/projects/${id}`)).status, 204);
    const result = await turn;
    // the stream ends only after the agent loop finished, so no model call can follow
    assert.equal(result.events.at(-1).event, 'cancelled');
    assert.ok(!result.events.some((e) => e.event === 'tool_result'), 'the tool call was never answered');
    assert.ok(Date.now() - started < 10000, 'ended long before the tool timeout');
    assert.equal(providerCalls.length, calls, 'no further model calls');
  });
});

describe('permanent delete', () => {
  it('needs the project name repeated, checked on the server', async () => {
    const id = await sharedProject('Keep me');
    for (const body of [{ permanent: true }, { permanent: true, confirmName: 'keep me' }, { permanent: true, confirmName: ' Keep me' }]) {
      const res = await owner()('DELETE', `/api/projects/${id}`, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.error, /Type the project name/);
    }
    assert.equal((await owner()('DELETE', `/api/projects/${id}`, { permanent: 'yes' })).status, 400);
    assert.equal((await owner()('DELETE', `/api/projects/${id}`, '{not json')).status, 400);
    assert.equal((await owner()('GET', `/api/projects/${id}`)).status, 200);
    assert.ok(await listed('Eddie', id));
  });

  it('removes the project and everything belonging to it', async () => {
    const id = await sharedProject('Gone for good');
    await owner()('PUT', `/api/projects/${id}`, { xml: diagram('Second'), force: true });
    const link = (await owner()('POST', `/api/projects/${id}/access/links`, { role: 'viewer' })).body;
    await owner()('POST', `/api/projects/${id}/access/invites`, { email: 'later@example.com', role: 'viewer' });
    const eddie = await browser(server, 'Eddie');
    await eddie.call('POST', chatPath(id), { title: 'About it' });
    const tab = await openLive(server, id, client(), 'Vera');
    await tab.next('hello');

    const res = await owner()('DELETE', `/api/projects/${id}`, { permanent: true, confirmName: 'Gone for good' });
    assert.equal(res.status, 204);
    assert.deepEqual(await tab.next('access-revoked'), { reason: 'deleted' });
    for (const user of ['Olivia', 'Eddie', 'Vera']) {
      assert.equal(await listed(user, id), false);
      assert.equal((await server.as(user)('GET', `/api/projects/${id}`)).status, 404);
    }
    // the link is gone with it, not merely pointing at a deleted project
    assert.equal((await server.as('Linda')('POST', '/api/share/join', { token: link.token })).status, 404);

    // the id is free again; a new project with it starts empty: one version, no members, links, invites, chats or log
    assert.equal((await owner()('POST', '/api/projects', { name: 'Gone for good' })).body.id, id);
    assert.equal((await owner()('GET', `/api/projects/${id}/history`)).body.length, 1);
    const access = (await owner()('GET', `/api/projects/${id}/access`)).body;
    assert.deepEqual([access.grants, access.links, access.invites], [[], [], []]);
    assert.deepEqual((await owner()('GET', `/api/projects/${id}/access/log`)).body.map((e) => e.action), ['project.create']);
    await server.grant(id, 'Eddie', 'editor', 'Olivia');
    assert.deepEqual((await eddie.call('GET', chatPath(id))).body, []);
  });
});
