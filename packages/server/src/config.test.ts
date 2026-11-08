import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configFromEnv, loadConfigFromEnv, mergeConfig, parseConfig } from './config.ts';
import { DEFAULT_PERSONAL_PROVIDERS } from './llm/catalog.ts';
import { claudeCodeEntry } from './llm/claudeCodeCli.ts';

describe('parseConfig', () => {
  it('applies defaults', () => {
    const config = parseConfig({ publicDir: '/srv/public' });
    expect(config).toEqual({
      port: 3000,
      host: '0.0.0.0',
      dataDir: path.join(os.homedir(), 'workspace', 'bpmn-diagrams'),
      publicDir: '/srv/public',
      llm: { mode: 'personal', providers: DEFAULT_PERSONAL_PROVIDERS },
      auth: {
        kind: 'dev',
        sessionDays: 30,
        oidc: { scopes: 'openid profile email', allowedEmailDomains: [] },
        trustedHeaders: { subjectHeader: 'x-forwarded-user', proxySecretHeader: 'x-proxy-secret', trustedProxies: [] }
      },
      storage: {
        kind: 'sqlite',
        sqlitePath: path.join(os.homedir(), 'workspace', 'bpmn-diagrams', 'flowboard.sqlite'),
        postgresPoolSize: 10,
        postgresListen: true,
        importOnFirstStart: true
      },
      chat: {
        enabled: true,
        systemPromptAppend: '',
        toolTimeoutMs: 30000,
        maxIterations: 20,
        maxActiveTurnsPerUser: 8,
        turnsPerMinute: 10,
        idleDays: 30,
        workDir: path.join(os.tmpdir(), 'bpmn-chat'),
        claudeCode: { enabled: false, bin: 'claude', model: '', timeoutMs: 300000 }
      }
    });
  });

  it('puts the SQLite file in the data folder unless told otherwise', () => {
    expect(parseConfig({ publicDir: '/p', dataDir: '/data' }).storage.sqlitePath).toBe('/data/flowboard.sqlite');
    expect(parseConfig({ publicDir: '/p', storage: { sqlitePath: '/db/x.sqlite' } }).storage.sqlitePath).toBe('/db/x.sqlite');
  });

  it('requires a connection string for Postgres', () => {
    expect(() => parseConfig({ publicDir: '/p', storage: { kind: 'postgres' } })).toThrow(/DATABASE_URL/);
  });

  it('expands ~ and resolves relative paths', () => {
    const config = parseConfig({ publicDir: 'public', dataDir: '~/diagrams' });
    expect(config.dataDir).toBe(path.join(os.homedir(), 'diagrams'));
    expect(config.publicDir).toBe(path.resolve('public'));
  });

  it('fails with a readable message', () => {
    expect(() => parseConfig({ publicDir: '/p', port: 70000 })).toThrow(/Invalid configuration:[\s\S]*port/);
    expect(() => parseConfig({})).toThrow(/publicDir/);
  });
});

describe('configFromEnv', () => {
  it('maps environment variables', () => {
    expect(configFromEnv({
      PORT: '8080', HOST: '127.0.0.1', BPMN_DIR: '/data', CHAT: 'off',
      CLAUDE_BIN: '/bin/claude', CLAUDE_MODEL: 'sonnet', CHAT_TIMEOUT_MS: '1000'
    })).toEqual({
      port: 8080,
      host: '127.0.0.1',
      dataDir: '/data',
      auth: { oidc: {}, trustedHeaders: {} },
      llm: {},
      storage: { kind: undefined, sqlitePath: undefined, postgresUrl: undefined, postgresPoolSize: undefined, importOnFirstStart: undefined },
      chat: { enabled: false, claudeCode: { bin: '/bin/claude', model: 'sonnet', timeoutMs: 1000 } }
    });
  });

  it('maps storage variables', () => {
    expect(mergeConfig(configFromEnv({ DATABASE_URL: 'postgres://db/x', PG_POOL_SIZE: '4', IMPORT_ON_FIRST_START: 'off' })).storage)
      .toEqual({ kind: 'postgres', postgresUrl: 'postgres://db/x', postgresPoolSize: 4, importOnFirstStart: false });
    expect(mergeConfig(configFromEnv({ DATABASE_URL: 'postgres://db/x', STORAGE: 'sqlite', SQLITE_PATH: '/x.sqlite' })).storage)
      .toEqual({ kind: 'sqlite', postgresUrl: 'postgres://db/x', sqlitePath: '/x.sqlite' });
  });

  it('leaves unset and empty variables out', () => {
    const merged = mergeConfig(configFromEnv({ CLAUDE_MODEL: '', CHAT: '' }));
    expect(merged).toEqual({ auth: { oidc: {}, trustedHeaders: {} }, storage: {}, llm: {}, chat: { claudeCode: {} } });
  });

  it('maps auth variables', () => {
    expect(mergeConfig(configFromEnv({
      AUTH: 'trusted-headers', PUBLIC_ORIGIN: 'https://bpmn.example.com', SESSION_DAYS: '7',
      AUTH_SUBJECT_HEADER: 'X-User', AUTH_PROXY_SECRET: 'secret', AUTH_TRUSTED_PROXIES: '10.0.0.0/8, ::1'
    }))).toMatchObject({
      publicOrigin: 'https://bpmn.example.com',
      auth: { kind: 'trusted-headers', sessionDays: 7, trustedHeaders: { subjectHeader: 'x-user', proxySecret: 'secret', trustedProxies: ['10.0.0.0/8', '::1'] } }
    });
  });

  it('validates the public origin and trusted-headers settings', () => {
    expect(parseConfig({ publicDir: '/p', publicOrigin: 'https://bpmn.example.com/' }).publicOrigin).toBe('https://bpmn.example.com');
    expect(() => parseConfig({ publicDir: '/p', publicOrigin: 'https://bpmn.example.com/app' })).toThrow(/http\(s\) origin/);
    expect(() => parseConfig({ publicDir: '/p', auth: { kind: 'trusted-headers' } })).toThrow(/verify the proxy/);
    expect(() => parseConfig({ publicDir: '/p', auth: { kind: 'trusted-headers', trustedHeaders: { proxySecret: 'short' } } })).toThrow();
  });

  it('treats any CHAT value other than "off" as on', () => {
    expect(configFromEnv({ CHAT: 'on' }).chat?.enabled).toBe(true);
  });

  it('reads the chat settings of the assistant', () => {
    const chat = configFromEnv({ CHAT_SYSTEM_PROMPT_APPEND: 'Use German names.', CHAT_TOOL_TIMEOUT_MS: '5000', CHAT_IDLE_DAYS: '7' }).chat;
    expect(chat).toMatchObject({ systemPromptAppend: 'Use German names.', toolTimeoutMs: 5000, idleDays: 7 });
    expect(() => parseConfig({ publicDir: '/p', chat: { toolTimeoutMs: 10 } })).toThrow();
  });

  it('rejects non-numeric numbers', () => {
    expect(() => configFromEnv({ PORT: 'eighty' })).toThrow('PORT must be a number');
  });
});

describe('mergeConfig', () => {
  it('merges nested objects and ignores undefined', () => {
    expect(mergeConfig({ a: 1, n: { x: 1, y: 2 } }, { a: undefined, n: { y: 3 } }, null)).toEqual({ a: 1, n: { x: 1, y: 3 } });
  });
});

describe('loadConfigFromEnv', () => {
  it('ranks overrides > environment > APP_CONFIG module > defaults', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    try {
      const modulePath = path.join(dir, 'app.config.mjs');
      await fs.writeFile(modulePath, `export default { port: 4000, host: '10.0.0.1', chat: { claudeCode: { model: 'from-module', bin: 'module-bin' } } };`);
      const config = await loadConfigFromEnv({
        env: { APP_CONFIG: modulePath, PORT: '5000', CLAUDE_MODEL: 'from-env' },
        defaults: { publicDir: '/default/public', port: 1000, host: 'default-host' },
        overrides: { chat: { claudeCode: { model: 'from-override' } } }
      });
      expect(config.port).toBe(5000);
      expect(config.host).toBe('10.0.0.1');
      expect(config.publicDir).toBe('/default/public');
      expect(config.chat.claudeCode).toEqual({ enabled: false, bin: 'module-bin', model: 'from-override', timeoutMs: 300000 });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('AI provider settings', () => {
  const managed = (providers: unknown[]) => parseConfig({ publicDir: '/p', llm: { mode: 'managed', providers } });

  it("starts in personal mode with providers that take the user's own key", () => {
    const config = parseConfig({ publicDir: '/p' });
    expect(config.llm.mode).toBe('personal');
    expect(config.llm.providers.map((p) => [p.id, p.credentials.from])).toEqual([['anthropic', 'user-key'], ['openai', 'user-key']]);
    expect(parseConfig({ publicDir: '/p', llm: { mode: 'managed' } }).llm.providers).toEqual([]);
  });

  it('allows only own keys in personal mode', () => {
    expect(() => parseConfig({ publicDir: '/p', llm: { providers: [{ id: 'x', label: 'X', type: 'anthropic', credentials: { from: 'server', secretEnv: 'X_KEY' } }] } }))
      .toThrow(/personal mode/);
  });

  it('accepts managed providers with server, identity and adapter credentials', () => {
    const adapter = () => ({ bearer: 't' });
    const config = managed([
      { id: 'gw', label: 'Gateway', type: 'openai-compatible', baseUrl: 'https://gw.example.com/v1', credentials: { from: 'identity' }, userIdHeader: 'x-user-id' },
      { id: 'srv', label: 'Server', type: 'anthropic', credentials: { from: 'server', secretEnv: 'ANTHROPIC_API_KEY' } },
      { id: 'custom', label: 'Custom', type: 'anthropic', credentials: { from: 'adapter', adapter } }
    ]);
    expect(config.llm.providers.map((p) => p.id)).toEqual(['gw', 'srv', 'custom']);
  });

  it('rejects duplicate ids, a missing base URL, bad env names and non-function adapters', () => {
    const p = { label: 'X', type: 'anthropic', credentials: { from: 'user-key' } };
    expect(() => managed([{ id: 'a', ...p }, { id: 'a', ...p }])).toThrow(/unique/);
    expect(() => managed([{ id: 'o', label: 'O', type: 'openai-compatible', credentials: { from: 'user-key' } }])).toThrow(/baseUrl/);
    expect(() => managed([{ id: 's', label: 'S', type: 'anthropic', credentials: { from: 'server', secretEnv: 'not valid' } }])).toThrow();
    expect(() => managed([{ id: 'd', label: 'D', type: 'anthropic', credentials: { from: 'adapter', adapter: 'nope' } }])).toThrow(/function/);
  });

  it('reads LLM_MODE, LLM_PROVIDERS, APP_SECRET and AUTH_TOKEN_HEADER', () => {
    const merged = mergeConfig(configFromEnv({
      LLM_MODE: 'managed', LLM_PROVIDERS: '[{"id":"gw"}]', APP_SECRET: 's'.repeat(40), AUTH_TOKEN_HEADER: 'X-Token'
    }));
    expect(merged).toMatchObject({ llm: { mode: 'managed', providers: [{ id: 'gw' }] }, appSecret: 's'.repeat(40), auth: { trustedHeaders: { tokenHeader: 'x-token' } } });
    expect(() => configFromEnv({ LLM_PROVIDERS: '[{' })).toThrow('LLM_PROVIDERS must be valid JSON');
    expect(() => parseConfig({ publicDir: '/p', appSecret: 'short' })).toThrow(/at least 32/);
  });
});

describe('Claude Code CLI provider', () => {
  it('is described by a catalog entry with the CLI settings', () => {
    const config = parseConfig({ publicDir: '/p', chat: { claudeCode: { enabled: true, model: 'opus' } } });
    expect(config.llm.providers.map((p) => p.id)).toEqual(['anthropic', 'openai']); // added by the server
    // parsing the parsed configuration again gives the same result
    expect(parseConfig(config)).toEqual(config);
    const entry = claudeCodeEntry(config.chat.claudeCode, config.chat.workDir);
    expect(entry).toMatchObject({ id: 'claude-code', type: 'claude-code-cli', credentials: { from: 'local' }, defaultModel: 'opus' });
    expect(entry.models).toContain('default');
    expect(entry.cli).toEqual({ bin: 'claude', timeoutMs: 300000, workDir: path.join(os.tmpdir(), 'bpmn-chat') });
  });

  it('is refused with any other sign-in, also in managed mode', () => {
    const proxy = { kind: 'trusted-headers' as const, trustedHeaders: { proxySecret: 'a-long-enough-proxy-secret' } };
    expect(() => parseConfig({ publicDir: '/p', auth: proxy, chat: { claudeCode: { enabled: true } } })).toThrow(/needs AUTH=dev/);
    expect(() => parseConfig({ publicDir: '/p', auth: proxy, llm: { mode: 'managed' }, chat: { claudeCode: { enabled: true } } })).toThrow(/needs AUTH=dev/);
  });

  it('is switched on with CHAT_CLAUDE_CODE=on and limited with CHAT_TURNS_PER_MINUTE', () => {
    const env = configFromEnv({ CHAT_CLAUDE_CODE: 'on', CHAT_TURNS_PER_MINUTE: '0' });
    expect(env.chat?.claudeCode?.enabled).toBe(true);
    expect(env.chat?.turnsPerMinute).toBe(0);
    expect(configFromEnv({ CHAT_CLAUDE_CODE: 'off' }).chat?.claudeCode?.enabled).toBe(false);
  });
});
