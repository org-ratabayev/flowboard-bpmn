import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthStore } from '../auth/authStore.ts';
import type { DocumentStore } from '../storage/sqlStore.ts';
import { backends } from '../storage/testBackends.ts';
import { createAnthropicProvider } from './anthropic.ts';
import { createCatalog, type ProviderEntry } from './catalog.ts';
import { createKeyStore, keyHint, newKeyring, parseKeyring } from './keyStore.ts';
import { createOpenAiCompatibleProvider, toChatMessages } from './openai.ts';
import { redact } from './routes.ts';
import type { LlmEvent } from './types.ts';

// ---------- a local stand-in for provider APIs ----------

interface Recorded { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }
let api: http.Server;
let base = '';
const recorded: Recorded[] = [];
let reply: (req: Recorded, res: http.ServerResponse) => void = () => {};

beforeAll(async () => {
  api = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const entry = { method: req.method!, url: req.url!, headers: req.headers, body: body ? JSON.parse(body) : null };
      recorded.push(entry);
      reply(entry, res);
    });
  });
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => api.close(() => r())));
beforeEach(() => { recorded.length = 0; });

const sse = (res: http.ServerResponse, events: Array<[string | null, unknown]>) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const [event, data] of events) res.write(`${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  res.end();
};
const collect = async (stream: AsyncIterable<LlmEvent>) => { const out: LlmEvent[] = []; for await (const e of stream) out.push(e); return out; };
const tool = { name: 'add_task', description: 'Add a task', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } };

describe('Anthropic provider', () => {
  it('streams text and tool calls, and sends the key and API version', async () => {
    reply = (_req, res) => sse(res, [
      ['message_start', { type: 'message_start', message: { usage: { input_tokens: 12 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Adding ' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'it.' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'add_task', input: {} } }],
      ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"name": "Rev' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'iew"}' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 1 }],
      ['ping', { type: 'ping' }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } }],
      ['message_stop', { type: 'message_stop' }]
    ]);
    const events = await collect(createAnthropicProvider({ baseUrl: base }).stream({
      model: 'claude-x', system: 'Be brief', tools: [tool], credentials: { apiKey: 'sk-ant-secret' },
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Add a review task' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't0', name: 'add_task', input: { name: 'A' } }] },
        { role: 'user', content: [{ type: 'tool_result', toolUseId: 't0', content: 'failed', isError: true }] }
      ]
    }));
    expect(events).toEqual([
      { type: 'text', text: 'Adding ' },
      { type: 'text', text: 'it.' },
      { type: 'tool_call', id: 'toolu_1', name: 'add_task', input: { name: 'Review' } },
      { type: 'usage', inputTokens: 12, outputTokens: 30 },
      { type: 'done', stopReason: 'tool_use' }
    ]);
    const [request] = recorded;
    expect(request.url).toBe('/v1/messages');
    expect(request.headers['x-api-key']).toBe('sk-ant-secret');
    expect(request.headers['anthropic-version']).toBe('2023-06-01');
    expect(request.body).toMatchObject({ model: 'claude-x', system: 'Be brief', stream: true, tools: [{ name: 'add_task', input_schema: tool.inputSchema }] });
    expect(request.body.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't0', content: 'failed', is_error: true });
  });

  it('uses a bearer token for identity credentials and reports API errors with their status', async () => {
    reply = (_req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'invalid x-api-key' } })); };
    const provider = createAnthropicProvider({ baseUrl: base });
    await expect(collect(provider.stream({ model: 'm', system: '', messages: [], tools: [], credentials: { bearer: 'user-token' } })))
      .rejects.toMatchObject({ name: 'LlmError', status: 401, message: 'Anthropic API: invalid x-api-key' });
    expect(recorded[0].headers.authorization).toBe('Bearer user-token');
    expect(recorded[0].headers['x-api-key']).toBeUndefined();
  });

  it('lists models', async () => {
    reply = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'claude-a' }, { id: 'claude-b' }] })); };
    expect(await createAnthropicProvider({ baseUrl: base }).listModels({ apiKey: 'k' })).toEqual(['claude-a', 'claude-b']);
  });
});

describe('OpenAI-compatible provider', () => {
  it('streams text and tool calls assembled from fragments', async () => {
    reply = (_req, res) => sse(res, [
      [null, { choices: [{ index: 0, delta: { role: 'assistant', content: 'On it' } }] }],
      [null, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'add_task', arguments: '' } }] } }] }],
      [null, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"name":' } }] } }] }],
      [null, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"Review"}' } }] }, finish_reason: 'tool_calls' }] }],
      [null, { choices: [], usage: { prompt_tokens: 7, completion_tokens: 9 } }],
      [null, '[DONE]']
    ]);
    const events = await collect(createOpenAiCompatibleProvider({ baseUrl: `${base}/v1` }).stream({
      model: 'gpt-x', system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: [tool],
      credentials: { apiKey: 'sk-proj-secret', headers: { 'x-app': 'flowboard' } }
    }));
    expect(events).toEqual([
      { type: 'text', text: 'On it' },
      { type: 'tool_call', id: 'call_1', name: 'add_task', input: { name: 'Review' } },
      { type: 'usage', inputTokens: 7, outputTokens: 9 },
      { type: 'done', stopReason: 'tool_use' }
    ]);
    expect(recorded[0].url).toBe('/v1/chat/completions');
    expect(recorded[0].headers.authorization).toBe('Bearer sk-proj-secret');
    expect(recorded[0].headers['x-app']).toBe('flowboard');
    expect(recorded[0].body.tools[0]).toEqual({ type: 'function', function: { name: 'add_task', description: 'Add a task', parameters: tool.inputSchema } });
  });

  it('converts tool results and assistant tool calls to chat messages', () => {
    expect(toChatMessages('sys', [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'c1', name: 'add_task', input: { name: 'A' } }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 'c1', content: 'done' }, { type: 'text', text: 'thanks' }] }
    ])).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'add_task', arguments: '{"name":"A"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'done' },
      { role: 'user', content: 'thanks' }
    ]);
  });

  it('lists models', async () => {
    reply = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }] })); };
    expect(await createOpenAiCompatibleProvider({ baseUrl: base }).listModels({ apiKey: 'k' })).toEqual(['a', 'b']);
  });
});

describe('provider catalog', () => {
  const user = { id: 'u1', provider: 'oidc', subject: 'sub-1', name: 'Ann', email: null };
  const entry = (credentials: ProviderEntry['credentials'], extra: Partial<ProviderEntry> = {}): ProviderEntry =>
    ({ id: 'p', label: 'P', type: 'anthropic', models: [], credentials, headers: {}, ...extra });

  it('resolves each kind of credentials, adding extra headers and the user id header', async () => {
    const catalog = createCatalog([
      entry({ from: 'user-key' }, { id: 'own' }),
      entry({ from: 'server', secretEnv: 'TEST_KEY' }, { id: 'srv', headers: { 'x-app': 'flowboard' } }),
      entry({ from: 'identity' }, { id: 'idp', userIdHeader: 'x-user-id' }),
      entry({ from: 'adapter', adapter: ({ upstreamToken, user: u }) => (u.subject === 'sub-1' ? { bearer: `exchanged-${upstreamToken}` } : null) }, { id: 'adp' })
    ], { TEST_KEY: 'server-secret' });
    const ctx = { user, upstreamToken: 'tok' };
    expect(await catalog.resolve(catalog.get('own')!, { ...ctx, userKey: 'mine' })).toEqual({ credentials: { apiKey: 'mine', headers: {} } });
    expect(await catalog.resolve(catalog.get('own')!, ctx)).toEqual({ unavailable: 'Add your own key for this provider in Settings' });
    expect(await catalog.resolve(catalog.get('srv')!, ctx)).toEqual({ credentials: { apiKey: 'server-secret', headers: { 'x-app': 'flowboard' } } });
    expect(await catalog.resolve(catalog.get('idp')!, ctx)).toEqual({ credentials: { bearer: 'tok', headers: { 'x-user-id': 'sub-1' } } });
    expect(await catalog.resolve(catalog.get('idp')!, { ...ctx, upstreamToken: null })).toHaveProperty('unavailable');
    expect(await catalog.resolve(catalog.get('adp')!, ctx)).toEqual({ credentials: { bearer: 'exchanged-tok', headers: {} } });
    expect(await catalog.resolve(catalog.get('adp')!, { ...ctx, user: { ...user, subject: 'other' } })).toHaveProperty('unavailable');

    const summaries = await catalog.summaries(ctx);
    expect(summaries.map((s) => [s.id, s.ready])).toEqual([['own', false], ['srv', true], ['idp', true], ['adp', true]]);
    expect(JSON.stringify(summaries)).not.toContain('server-secret');
  });

  it('reports a missing server secret as not ready', async () => {
    const catalog = createCatalog([entry({ from: 'server', secretEnv: 'MISSING_KEY' })], {});
    expect((await catalog.summaries({ user, upstreamToken: null }))[0]).toMatchObject({ ready: false, reason: 'Not configured on the server' });
  });
});

describe('helpers', () => {
  it('hints keys without revealing them and redacts them from messages', () => {
    expect(keyHint('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-…mnop');
    expect(keyHint('sk-proj-1234567890')).toBe('sk-proj-…7890');
    expect(keyHint('abcdefgh')).toBe('…efgh');
    expect(redact('bad key sk-123456 in sk-123456', 'sk-123456')).toBe('bad key [redacted] in [redacted]');
  });

  it('parses only well-formed keyring cookies', () => {
    const ring = newKeyring();
    expect(parseKeyring(ring.cookieValue)).toEqual({ id: ring.id, secret: ring.secret });
    for (const bad of [undefined, '', 'x.y', `${ring.id}.short`, ring.cookieValue + 'x']) expect(parseKeyring(bad)).toBeNull();
  });
});

describe.each(backends)('$name key store', (backend) => {
  let store: DocumentStore;
  let cleanup: () => Promise<void>;
  let userId: string;
  let otherUserId: string;
  const SECRET = 'app-secret-'.padEnd(40, 'x');
  beforeEach(async () => {
    ({ store, cleanup } = await backend.open());
    const auth = createAuthStore(store.db);
    userId = (await auth.upsertUser({ provider: 'dev', subject: 'ann', name: 'Ann', email: null })).id;
    otherUserId = (await auth.upsertUser({ provider: 'dev', subject: 'bob', name: 'Bob', email: null })).id;
  });
  afterEach(() => cleanup());

  it('decrypts only with the same browser secret and server secret', async () => {
    const keys = createKeyStore(store.db, SECRET);
    const ring = newKeyring();
    const saved = await keys.save(userId, 'anthropic', ring, 'sk-ant-the-real-key-1234');
    expect(saved.hint).toBe('sk-ant-…1234');
    expect(await keys.use(userId, 'anthropic', ring)).toBe('sk-ant-the-real-key-1234');

    expect(await keys.use(userId, 'anthropic', { id: ring.id, secret: newKeyring().secret })).toBeNull(); // other cookie secret
    expect(await createKeyStore(store.db, 'another-secret'.padEnd(40, 'y')).use(userId, 'anthropic', ring)).toBeNull(); // other server secret
    expect(await keys.use(userId, 'anthropic', newKeyring())).toBeNull(); // other browser

    const rows = await store.db.read((q) => q.all<Record<string, string>>('SELECT * FROM user_llm_keys'));
    expect(JSON.stringify(rows)).not.toContain('the-real-key');
  });

  it('binds a ciphertext to its user and provider', async () => {
    const keys = createKeyStore(store.db, SECRET);
    const ring = newKeyring();
    await keys.save(userId, 'anthropic', ring, 'sk-ant-moved-key-0000');
    // copy the row to another user and to another provider: neither decrypts
    await store.db.transaction(async (q) => {
      await q.run(`INSERT INTO user_llm_keys (user_id, provider_id, keyring_id, salt, iv, ciphertext, hint, created_at)
        SELECT $1, provider_id, keyring_id, salt, iv, ciphertext, hint, created_at FROM user_llm_keys WHERE user_id = $2`, [otherUserId, userId]);
      await q.run(`INSERT INTO user_llm_keys (user_id, provider_id, keyring_id, salt, iv, ciphertext, hint, created_at)
        SELECT user_id, 'openai', keyring_id, salt, iv, ciphertext, hint, created_at FROM user_llm_keys WHERE user_id = $1`, [userId]);
    });
    expect(await keys.use(otherUserId, 'anthropic', ring)).toBeNull();
    expect(await keys.use(userId, 'openai', ring)).toBeNull();
    expect(await keys.use(userId, 'anthropic', ring)).toBe('sk-ant-moved-key-0000');
  });

  it('keeps keys per browser, records use, and forgets a browser or unused keys', async () => {
    const keys = createKeyStore(store.db, SECRET);
    const laptop = newKeyring();
    const phone = newKeyring();
    await keys.save(userId, 'anthropic', laptop, 'sk-ant-laptop-1111');
    await keys.save(userId, 'anthropic', phone, 'sk-ant-phone-2222');
    await keys.save(userId, 'anthropic', laptop, 'sk-ant-laptop-3333'); // replaces
    expect(await keys.use(userId, 'anthropic', laptop)).toBe('sk-ant-laptop-3333');
    expect((await keys.list(userId, laptop.id))[0]).toMatchObject({ providerId: 'anthropic', hint: 'sk-ant-…3333' });
    expect((await keys.list(userId, laptop.id))[0].lastUsedAt).not.toBeNull();
    expect(await keys.list(userId, null)).toEqual([]);

    expect(await keys.removeKeyring(laptop.id)).toBe(1);
    expect(await keys.use(userId, 'anthropic', laptop)).toBeNull();
    expect(await keys.use(userId, 'anthropic', phone)).toBe('sk-ant-phone-2222');
    expect(await keys.removeUnused(1)).toBe(0);
    await store.db.transaction((q) => q.run("UPDATE user_llm_keys SET last_used_at = $1, created_at = $1", ['2000-01-01T00:00:00.000Z']));
    expect(await keys.removeUnused(1)).toBe(1);
  });
});
