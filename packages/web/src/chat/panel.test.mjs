// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatPanel, proposalText, transcript, usageText } from './panel.mjs';

describe('chat transcript', () => {
  it('shows user messages with their files and one reply per turn with summed usage', () => {
    const messages = [
      { role: 'user', turnId: 't1', content: [{ type: 'text', text: 'Add a review' }, { type: 'text', text: '<attachment name="notes.md">\nx\n</attachment>' }] },
      { role: 'assistant', turnId: 't1', content: [{ type: 'tool_use', id: 'a', name: 'bpmn_get_summary', input: {} }], usage: { inputTokens: 100, outputTokens: 10 } },
      { role: 'user', turnId: 't1', content: [{ type: 'tool_result', toolUseId: 'a', content: '{}' }] },
      { role: 'assistant', turnId: 't1', content: [{ type: 'text', text: 'Done.' }], usage: { inputTokens: 150, outputTokens: 20 } }
    ];
    expect(transcript(messages)).toEqual([
      { role: 'user', text: 'Add a review', files: ['notes.md'] },
      { role: 'assistant', turnId: 't1', text: 'Done.', tools: ['bpmn_get_summary'], usage: { inputTokens: 250, outputTokens: 30 } }
    ]);
  });

  it('formats usage and proposal counts', () => {
    expect(usageText({ inputTokens: 1234, outputTokens: 56 })).toBe('1,234 tokens in · 56 out');
    expect(usageText({ inputTokens: 1, outputTokens: 2, costUsd: 0.034 })).toBe('1 tokens in · 2 out · $0.03');
    expect(proposalText({ added: ['a', 'b'], changed: [], moved: ['c'], removed: ['d'] })).toBe('2 added · 1 moved · 1 removed');
  });
});

describe('chat panel', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'editor.html'), 'utf8');
  const routes = new Map();

  beforeEach(() => {
    const aside = /<aside class="side-panel chat" id="chat">[\s\S]*?<\/aside>/.exec(html)[0];
    document.body.innerHTML = aside;
    Element.prototype.scrollIntoView = () => {};
    routes.clear();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const route = routes.get(String(url));
      if (!route) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const panel = (role = 'owner') => createChatPanel({
    api: '/api/projects/p1',
    $: (id) => document.getElementById(id),
    tools: {},
    proposals: { onChange: () => () => {} },
    role: () => role,
    toast: vi.fn(),
    onTurnEnd: () => {}
  });

  it('points to Settings when no provider is ready', async () => {
    routes.set('/api/llm/providers', { body: { mode: 'personal', providers: [
      { id: 'anthropic', label: 'Anthropic', models: ['m1'], ready: false, reason: 'Add your own key for this provider in Settings' }
    ] } });
    routes.set('/api/projects/p1/chat/conversations', { body: [] });
    await panel().open();
    const notice = document.getElementById('chatNotice');
    expect(notice.hidden).toBe(false);
    expect(notice.querySelector('a').getAttribute('href')).toBe('/settings');
    expect(notice.textContent).toMatch(/Settings → AI providers/);
    expect(document.getElementById('chatSend').disabled).toBe(true);
    expect(document.querySelector('#chatModel option').disabled).toBe(true);
  });

  it('lists models of providers without a fixed list, or offers to type one', async () => {
    routes.set('/api/llm/providers', { body: { mode: 'managed', providers: [
      { id: 'gw', label: 'Gateway', models: [], ready: true },
      { id: 'other', label: 'Other', models: [], ready: true }
    ] } });
    routes.set('/api/llm/providers/gw/models', { body: { models: ['large', 'small'], defaultModel: null } });
    routes.set('/api/llm/providers/other/models', { status: 502, body: { error: 'down' } });
    routes.set('/api/projects/p1/chat/conversations', { body: [] });
    await panel().open();
    const options = [...document.querySelectorAll('#chatModel option')].map((o) => o.textContent);
    expect(options).toEqual(['large', 'small', 'Other model…']);
    const select = document.getElementById('chatModel');
    select.value = select.options[2].value;
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('chatModelText').hidden).toBe(false);
    expect(document.getElementById('chatNotice').hidden).toBe(true);
  });

  it('opens the latest conversation and tells viewers what the assistant can do', async () => {
    routes.set('/api/llm/providers', { body: { mode: 'managed', providers: [{ id: 'gw', label: 'Gateway', models: ['large'], ready: true }] } });
    routes.set('/api/projects/p1/chat/conversations', { body: [{ id: 'c1', title: 'Ideas' }] });
    routes.set('/api/projects/p1/chat/conversations/c1', { body: { id: 'c1', title: 'Ideas', providerId: 'gw', model: 'large', messages: [], turns: [] } });
    await panel('viewer').open();
    expect(document.getElementById('chatConversation').value).toBe('c1');
    expect(document.getElementById('chatRename').disabled).toBe(false);
    expect(document.querySelector('.chat-msg.hint').textContent).toMatch(/can view this diagram/);
  });
});
