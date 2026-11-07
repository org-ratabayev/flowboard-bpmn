import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configFromEnv, loadConfigFromEnv, mergeConfig, parseConfig } from './config.ts';

describe('parseConfig', () => {
  it('applies defaults', () => {
    const config = parseConfig({ publicDir: '/srv/public' });
    expect(config).toEqual({
      port: 3000,
      host: '0.0.0.0',
      dataDir: path.join(os.homedir(), 'workspace', 'bpmn-diagrams'),
      publicDir: '/srv/public',
      auth: {
        kind: 'dev',
        sessionDays: 30,
        trustedHeaders: { subjectHeader: 'x-forwarded-user', proxySecretHeader: 'x-proxy-secret', trustedProxies: [] }
      },
      storage: {
        kind: 'sqlite',
        sqlitePath: path.join(os.homedir(), 'workspace', 'bpmn-diagrams', 'flowboard.sqlite'),
        postgresPoolSize: 10,
        importOnFirstStart: true
      },
      chat: {
        enabled: true,
        workDir: path.join(os.tmpdir(), 'bpmn-chat'),
        claudeCode: { bin: 'claude', model: '', timeoutMs: 300000 }
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
      auth: { trustedHeaders: {} },
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
    expect(merged).toEqual({ auth: { trustedHeaders: {} }, storage: {}, chat: { claudeCode: {} } });
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
      expect(config.chat.claudeCode).toEqual({ bin: 'module-bin', model: 'from-override', timeoutMs: 300000 });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
