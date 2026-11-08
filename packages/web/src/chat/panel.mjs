// The chat panel: conversations, the model picker, sending a message and showing the streamed
// reply, running the tools the assistant calls, and the Keep / Undo line of its proposal.
// Talks to /api/projects/:id/chat/conversations… and /api/llm/providers (README "Chat API").

import { attachmentName, attachmentProblem, readAttachments } from './attachments.mjs';
import { readEventStream } from './stream.mjs';

const TOOL_LABELS = {
  bpmn_get_summary: 'Reading the diagram',
  bpmn_get_elements: 'Reading elements',
  bpmn_get_xml: 'Reading the XML',
  bpmn_lint: 'Checking for problems',
  bpmn_export_svg: 'Looking at the layout',
  bpmn_add_elements: 'Adding elements',
  bpmn_update_elements: 'Changing elements',
  bpmn_delete_elements: 'Removing elements',
  bpmn_connect: 'Connecting elements',
  bpmn_replace_xml: 'Replacing the diagram',
  bpmn_auto_layout: 'Arranging the layout',
  bpmn_summarize_changes: 'Describing the changes'
};

const number = (n) => Number(n || 0).toLocaleString('en-US');
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "1,234 tokens in · 56 out · $0.03" */
export function usageText(usage) {
  if (!usage) return '';
  const cost = typeof usage.costUsd === 'number' ? ` · $${usage.costUsd.toFixed(2)}` : '';
  return `${number(usage.inputTokens)} tokens in · ${number(usage.outputTokens)} out${cost}`;
}

/** Proposal counts: "2 added · 1 changed · 3 moved · 1 removed" (only the non-zero ones). */
export function proposalText(changes) {
  const parts = [['added', changes.added], ['changed', changes.changed], ['moved', changes.moved], ['removed', changes.removed]]
    .filter(([, ids]) => ids.length)
    .map(([what, ids]) => `${ids.length} ${what}`);
  return parts.join(' · ');
}

/**
 * Stored messages as chat entries: [{ role: 'user', text, files } | { role: 'assistant', text, tools, usage }].
 * Usage is summed per turn and shown under the turn's last reply.
 */
export function transcript(messages) {
  const out = [];
  let reply = null;
  for (const m of messages) {
    if (m.role === 'user') {
      const texts = m.content.filter((b) => b.type === 'text');
      if (!texts.length) continue; // tool results
      const files = texts.map((b) => attachmentName(b.text)).filter(Boolean);
      const text = texts.filter((b) => attachmentName(b.text) === null).map((b) => b.text).join('\n');
      out.push({ role: 'user', text, files });
      reply = null;
      continue;
    }
    if (!reply || reply.turnId !== m.turnId) {
      reply = { role: 'assistant', turnId: m.turnId, text: '', tools: [], usage: null };
      out.push(reply);
    }
    for (const block of m.content) {
      if (block.type === 'text') reply.text += (reply.text && !reply.text.endsWith('\n') ? '\n\n' : '') + block.text;
      if (block.type === 'tool_use') reply.tools.push(block.name);
    }
    if (m.usage) {
      reply.usage ??= { inputTokens: 0, outputTokens: 0 };
      reply.usage.inputTokens += m.usage.inputTokens;
      reply.usage.outputTokens += m.usage.outputTokens;
    }
  }
  return out;
}

/**
 * host: { api, $, tools, proposals, role(), toast(msg), onTurnEnd(), setChatAvailable(bool) }
 */
export function createChatPanel(host) {
  const { $, api } = host;
  const chatApi = `${api}/chat/conversations`;
  const state = {
    loaded: false,
    providers: [],
    mode: 'personal',
    conversations: [],
    current: null,       // conversation { id, providerId, model, title }
    busy: false,
    turnId: null,
    controller: null,
    files: [],
    choice: null         // { providerId, model } for the next new conversation
  };

  // ---------- rendering ----------

  function item(cls, text = '') {
    const li = document.createElement('li');
    li.className = `chat-msg ${cls}`;
    const body = document.createElement('div');
    body.className = 'chat-text';
    body.textContent = text;
    li.appendChild(body);
    $('chatLog').appendChild(li);
    li.scrollIntoView({ block: 'end' });
    return li;
  }

  function meta(li, text, cls = 'chat-meta') {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    li.appendChild(div);
    return div;
  }

  function hint() {
    const viewer = host.role() === 'viewer';
    item('hint', viewer
      ? 'You can view this diagram, so the assistant can answer questions about it but not change it.'
      : 'Ask the assistant to explain or change the diagram, e.g. “Add a manager approval step before Review order”. ' +
        'Its changes are highlighted; keep or undo them, then save.');
  }

  function renderTranscript(messages) {
    $('chatLog').innerHTML = '';
    const entries = transcript(messages);
    if (!entries.length) hint();
    for (const entry of entries) {
      if (entry.role === 'user') {
        const li = item('user', entry.text);
        if (entry.files.length) meta(li, `Attached: ${entry.files.join(', ')}`);
      } else {
        const li = item('assistant', entry.text || (entry.tools.length ? '' : '(no reply)'));
        if (entry.tools.length) meta(li, `Used: ${[...new Set(entry.tools.map((t) => TOOL_LABELS[t]?.toLowerCase() || t))].join(', ')}`);
        if (entry.usage) meta(li, usageText(entry.usage));
      }
    }
  }

  function notice(html) {
    $('chatNotice').innerHTML = html;
    $('chatNotice').hidden = !html;
  }

  function setBusy(busy) {
    state.busy = busy;
    $('chatSend').hidden = busy;
    $('chatCancel').hidden = !busy;
    for (const id of ['chatConversation', 'chatNew', 'chatRename', 'chatDelete', 'chatModel']) $(id).disabled = busy;
  }

  // ---------- providers and models ----------

  const choiceValue = (providerId, model) => JSON.stringify([providerId, model]);

  async function loadProviders() {
    const res = await fetch('/api/llm/providers');
    if (!res.ok) throw new Error(`Could not load the AI providers (${res.status})`);
    const body = await res.json();
    state.mode = body.mode;
    state.providers = await Promise.all(body.providers.map(async (p) => {
      if (!p.ready || p.models.length) return { ...p, freeText: false };
      // no fixed list: ask the provider; fall back to typing a model name
      try {
        const listed = await fetch(`/api/llm/providers/${encodeURIComponent(p.id)}/models`);
        if (!listed.ok) return { ...p, freeText: true };
        const { models, defaultModel } = await listed.json();
        return models.length ? { ...p, models, defaultModel: defaultModel || models[0], freeText: false } : { ...p, freeText: true };
      } catch {
        return { ...p, freeText: true };
      }
    }));
  }

  function renderModels() {
    const select = $('chatModel');
    select.innerHTML = '';
    const ready = state.providers.filter((p) => p.ready);
    for (const p of state.providers) {
      const group = document.createElement('optgroup');
      group.label = p.ready ? p.label : `${p.label} (${p.reason || 'not available'})`;
      for (const model of p.models) {
        const option = new Option(model, choiceValue(p.id, model));
        option.disabled = !p.ready;
        group.appendChild(option);
      }
      if (p.ready && p.freeText) group.appendChild(new Option('Other model…', choiceValue(p.id, '')));
      if (group.children.length) select.appendChild(group);
    }
    const wanted = state.current ? { providerId: state.current.providerId, model: state.current.model } : state.choice;
    if (wanted) {
      const value = choiceValue(wanted.providerId, wanted.model);
      if (![...select.options].some((o) => o.value === value)) {
        // e.g. a typed model name: keep it selectable
        const p = state.providers.find((x) => x.id === wanted.providerId);
        if (p?.ready) select.appendChild(new Option(`${p.label}: ${wanted.model}`, value));
      }
      select.value = value;
    }
    if (select.selectedIndex === -1 || select.selectedOptions[0]?.disabled) {
      const first = [...select.options].find((o) => !o.disabled);
      if (first) select.value = first.value;
    }
    syncModelText();

    if (!ready.length) {
      notice(state.mode === 'personal'
        ? 'No AI provider is ready yet. Add your API key under <a href="/settings">Settings → AI providers</a>.'
        : 'No AI model is available to you on this server. See <a href="/settings">Settings → AI providers</a>.');
    } else {
      notice('');
    }
    $('chatSend').disabled = !ready.length;
  }

  function selected() {
    const value = $('chatModel').value;
    if (!value) return null;
    const [providerId, model] = JSON.parse(value);
    if (model) return { providerId, model };
    const typed = $('chatModelText').value.trim();
    return typed ? { providerId, model: typed } : { providerId, model: null };
  }

  function syncModelText() {
    const value = $('chatModel').value;
    $('chatModelText').hidden = !value || JSON.parse(value)[1] !== '';
  }

  async function onModelChange() {
    syncModelText();
    const choice = selected();
    if (!choice?.model) return;
    state.choice = choice;
    if (!state.current) return;
    const res = await fetch(`${chatApi}/${state.current.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choice)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return host.toast(body.error || 'Could not switch the model');
    state.current = body;
  }

  // ---------- conversations ----------

  function renderConversations() {
    const select = $('chatConversation');
    select.innerHTML = '';
    if (!state.current) select.appendChild(new Option('New conversation', ''));
    for (const c of state.conversations) {
      select.appendChild(new Option(c.title || 'Untitled conversation', c.id));
    }
    select.value = state.current?.id ?? '';
    $('chatRename').disabled = !state.current;
    $('chatDelete').disabled = !state.current;
  }

  async function loadConversations() {
    const res = await fetch(chatApi);
    if (!res.ok) throw new Error(`Could not load your conversations (${res.status})`);
    state.conversations = await res.json();
  }

  async function openConversation(id) {
    if (!id) { state.current = null; renderConversations(); renderTranscript([]); renderModels(); return; }
    const res = await fetch(`${chatApi}/${id}`);
    if (!res.ok) { host.toast('Could not open the conversation'); return; }
    const conversation = await res.json();
    state.current = { id: conversation.id, providerId: conversation.providerId, model: conversation.model, title: conversation.title };
    renderConversations();
    renderModels();
    renderTranscript(conversation.messages);
    const failed = conversation.turns?.[0];
    if (failed?.status === 'failed' && failed.error) item('error', `Error: ${failed.error}`);
  }

  async function newConversation() {
    if (state.busy) return;
    await openConversation(null);
    $('chatInput').focus();
  }

  async function renameConversation() {
    if (!state.current || state.busy) return;
    const title = prompt('Name of this conversation:', state.current.title || '');
    if (title === null) return;
    const res = await fetch(`${chatApi}/${state.current.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
    });
    if (!res.ok) return host.toast('Could not rename the conversation');
    state.current = await res.json();
    await loadConversations();
    renderConversations();
  }

  async function deleteConversation() {
    if (!state.current || state.busy) return;
    if (!confirm(`Delete the conversation “${state.current.title || 'Untitled'}”? This cannot be undone.`)) return;
    const res = await fetch(`${chatApi}/${state.current.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) return host.toast('Could not delete the conversation');
    await loadConversations();
    await openConversation(state.conversations[0]?.id ?? null);
  }

  // ---------- attachments ----------

  function renderFiles() {
    const box = $('chatFiles');
    box.innerHTML = '';
    state.files.forEach((file, i) => {
      const chip = document.createElement('span');
      chip.className = 'chat-file';
      chip.textContent = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Remove';
      remove.onclick = () => { state.files.splice(i, 1); renderFiles(); };
      chip.appendChild(remove);
      box.appendChild(chip);
    });
  }

  function addFiles(files) {
    const next = [...state.files, ...files];
    const problem = attachmentProblem(next);
    if (problem) return host.toast(problem);
    state.files = next;
    renderFiles();
  }

  // ---------- a turn ----------

  function proposalLine(li, proposal) {
    const line = meta(li, '', 'chat-meta chat-proposal');
    const render = () => {
      line.innerHTML = '';
      const text = document.createElement('span');
      if (proposal.status === 'kept') text.textContent = `Kept: ${proposalText(proposal.changes)} (not saved yet)`;
      else if (proposal.status === 'undone') text.textContent = 'Undone';
      else text.textContent = `Changed the diagram: ${proposalText(proposal.changes)} · `;
      line.appendChild(text);
      if (proposal.status !== 'ready') return;
      for (const [label, action] of [['Keep', () => host.proposals.keep(proposal)], ['Undo', () => host.proposals.undo(proposal)]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = label === 'Keep' ? 'primary small' : 'small';
        button.textContent = label;
        button.dataset.proposal = label.toLowerCase();
        button.onclick = action;
        line.appendChild(button);
      }
    };
    render();
    const off = host.proposals.onChange((p) => {
      if (p !== proposal) return;
      render();
      if (p.status !== 'ready') off();
    });
  }

  async function send() {
    const message = $('chatInput').value.trim();
    if (!message || state.busy) return;
    const choice = selected();
    if (!state.current && !choice?.model) return host.toast('Choose a model first');

    setBusy(true);
    const files = state.files.splice(0);
    renderFiles();
    $('chatInput').value = '';
    if ($('chatLog').querySelector('.chat-msg.hint')) $('chatLog').innerHTML = '';
    const userItem = item('user', message);
    if (files.length) meta(userItem, `Attached: ${files.map((f) => f.name).join(', ')}`);
    let reply = null;
    let activity = null;
    const replyItem = () => (reply ??= item('assistant pending', ''));
    const turn = { request: message };
    let toolQueue = Promise.resolve();
    const usage = { inputTokens: 0, outputTokens: 0 };
    let ended = null;

    try {
      if (!state.current) {
        const res = await fetch(chatApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choice) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Could not start a conversation (${res.status})`);
        state.current = body;
      }
      const conversationId = state.current.id;
      state.controller = new AbortController();
      const res = await fetch(`${chatApi}/${conversationId}/turns`, {
        method: 'POST',
        signal: state.controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, attachments: files.length ? await readAttachments(files) : undefined })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === 'provider-unavailable') notice(`${esc(body.error)}. See <a href="/settings">Settings → AI providers</a>.`);
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const runTool = async (event) => {
        activity ??= meta(replyItem(), '', 'chat-activity');
        activity.textContent = `${TOOL_LABELS[event.name] || event.name}…`;
        const result = await host.tools.execute(event.name, event.input, turn);
        const answer = await fetch(`${chatApi}/${conversationId}/tool-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnId: event.turnId, toolCallId: event.id, content: result.content, isError: result.isError })
        });
        if (!answer.ok && answer.status !== 409) console.warn('Tool result not accepted', answer.status);
      };

      await readEventStream(res, ({ event, data }) => {
        if (event === 'turn') state.turnId = data.turnId;
        else if (event === 'text') {
          const li = replyItem();
          li.classList.remove('pending');
          li.querySelector('.chat-text').textContent += data.text;
          li.scrollIntoView({ block: 'end' });
        } else if (event === 'tool_request') {
          toolQueue = toolQueue.then(() => runTool(data)).catch((err) => console.warn('Tool failed', err));
        } else if (event === 'tool_result' && data.status !== 'done') {
          activity ??= meta(replyItem(), '', 'chat-activity');
          activity.textContent = data.status === 'refused' ? `Not allowed: ${data.error}` : `${TOOL_LABELS[data.name] || data.name}: ${data.status}`;
        } else if (event === 'usage') {
          usage.inputTokens += data.inputTokens;
          usage.outputTokens += data.outputTokens;
          if (typeof data.costUsd === 'number') usage.costUsd = (usage.costUsd ?? 0) + data.costUsd;
        } else if (event === 'done' || event === 'cancelled' || event === 'error') {
          ended = { event, data };
        }
      });
      await toolQueue;
      const li = replyItem();
      li.classList.remove('pending');
      if (!li.querySelector('.chat-text').textContent) li.querySelector('.chat-text').textContent = ended?.event === 'done' ? '(no reply)' : '';
      activity?.remove();
      const proposal = await host.proposals.finish(turn);
      if (proposal) proposalLine(li, proposal);
      if (ended?.event === 'cancelled') meta(li, 'Stopped');
      if (ended?.event === 'error') item('error', `Error: ${ended.data.message}`);
      if (usage.inputTokens || usage.outputTokens) meta(li, usageText(usage));
    } catch (err) {
      await toolQueue;
      const proposal = await host.proposals.finish(turn).catch(() => null);
      if (proposal) proposalLine(replyItem(), proposal);
      reply?.classList.remove('pending');
      item('error', err.name === 'AbortError' ? 'Stopped' : `Error: ${err.message}`);
    } finally {
      state.controller = null;
      state.turnId = null;
      setBusy(false);
      await loadConversations().catch(() => {});
      renderConversations();
      host.onTurnEnd();
    }
  }

  async function cancel() {
    if (!state.busy) return;
    if (state.turnId && state.current) {
      const res = await fetch(`${chatApi}/${state.current.id}/turns/${state.turnId}/cancel`, { method: 'POST' }).catch(() => null);
      if (res?.ok) return; // the stream ends with "cancelled"
    }
    state.controller?.abort();
  }

  // ---------- wiring ----------

  $('chatForm').addEventListener('submit', (e) => { e.preventDefault(); send(); });
  $('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('chatCancel').addEventListener('click', cancel);
  $('chatNew').addEventListener('click', newConversation);
  $('chatRename').addEventListener('click', renameConversation);
  $('chatDelete').addEventListener('click', deleteConversation);
  $('chatConversation').addEventListener('change', (e) => { if (!state.busy) openConversation(e.target.value || null); });
  $('chatModel').addEventListener('change', onModelChange);
  $('chatModelText').addEventListener('change', onModelChange);
  $('chatAttach').addEventListener('click', () => $('chatFileInput').click());
  $('chatFileInput').addEventListener('change', () => {
    addFiles([...$('chatFileInput').files]);
    $('chatFileInput').value = '';
  });

  return {
    get busy() { return state.busy; },

    /** Loads providers and conversations the first time the panel opens. */
    async open() {
      if (state.loaded) return;
      state.loaded = true;
      try {
        await Promise.all([loadProviders(), loadConversations()]);
        await openConversation(state.conversations[0]?.id ?? null);
      } catch (err) {
        state.loaded = false;
        notice('');
        item('error', err.message);
      }
    },

    /** The chat API answers 404 when chat is off on this server. */
    async available() {
      const res = await fetch(chatApi).catch(() => null);
      return !!res?.ok;
    },

    /** The user's role changed: update the hint for an empty conversation. */
    roleChanged() {
      if ($('chatLog').querySelector('.chat-msg.hint')) { $('chatLog').innerHTML = ''; hint(); }
    }
  };
}
