import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { DEFAULT_PERSONAL_PROVIDERS, type CredentialsAdapter, type ProviderEntry } from './llm/catalog.ts';

const expandHome = (p: string) => p.replace(/^~(?=$|\/)/, os.homedir());
const absolutePath = z.string().min(1).transform((p) => path.resolve(expandHome(p)));

const origin = z.string().transform((value, ctx) => {
  try {
    const parsed = new URL(value);
    if (['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value.replace(/\/$/, '')) return parsed.origin;
  } catch { /* reported below */ }
  ctx.addIssue({ code: 'custom', message: 'must be an http(s) origin such as https://bpmn.example.com' });
  return z.NEVER;
});

const providerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'lowercase letters, digits and dashes'),
    label: z.string().min(1).max(60),
    type: z.enum(['anthropic', 'openai-compatible']),
    baseUrl: z.url().optional(),
    models: z.array(z.string().min(1)).default([]),
    defaultModel: z.string().min(1).optional(),
    credentials: z.discriminatedUnion('from', [
      z.object({ from: z.literal('user-key') }),
      z.object({ from: z.literal('server'), secretEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'an environment variable name') }),
      z.object({ from: z.literal('identity') }),
      z.object({ from: z.literal('adapter'), adapter: z.custom<CredentialsAdapter>((v) => typeof v === 'function', 'a function (only from an APP_CONFIG module)') })
    ]),
    headers: z.record(z.string(), z.string()).default({}),
    userIdHeader: z.string().min(1).optional()
  })
  .refine((p) => p.type !== 'openai-compatible' || p.baseUrl, { message: 'openai-compatible providers need a baseUrl', path: ['baseUrl'] });

const baseSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().min(1).default('0.0.0.0'),
  /** Public address of the app, e.g. https://bpmn.example.com; used for cookies, CSRF checks and redirects. */
  publicOrigin: origin.optional(),
  /** Server secret (32+ characters); with Postgres every instance must use the same one. See appSecret.ts. */
  appSecret: z.string().min(32, 'APP_SECRET must have at least 32 characters').optional(),
  auth: z
    .object({
      /**
       * dev: sign in with just a name, no password (trusted networks only).
       * trusted-headers: identity comes from headers set by an authenticating reverse proxy.
       * oidc: sign in with an OpenID Connect provider (authorization code + PKCE).
       */
      kind: z.enum(['dev', 'trusted-headers', 'oidc']).default('dev'),
      sessionDays: z.number().int().positive().default(30),
      oidc: z
        .object({
          /** Issuer URL; its /.well-known/openid-configuration is read on the first sign-in. */
          issuer: z.url().optional(),
          clientId: z.string().min(1).optional(),
          /** Omit for a public client (PKCE only). */
          clientSecret: z.string().min(1).optional(),
          scopes: z.string().min(1).default('openid profile email'),
          /** Only users whose verified email is in one of these domains may sign in (empty: everyone). */
          allowedEmailDomains: z.array(z.string().min(1)).default([])
        })
        .prefault({}),
      trustedHeaders: z
        .object({
          subjectHeader: z.string().min(1).default('x-forwarded-user'),
          nameHeader: z.string().min(1).optional(),
          emailHeader: z.string().min(1).optional(),
          /** The proxy proves itself with this header and secret ... */
          proxySecretHeader: z.string().min(1).default('x-proxy-secret'),
          /** Header in which the proxy forwards the user's access token (for AI providers using the user's identity). */
          tokenHeader: z.string().min(1).optional(),
          proxySecret: z.string().min(16).optional(),
          /** ... or by connecting from one of these addresses / CIDR ranges. */
          trustedProxies: z.array(z.string().min(1)).default([])
        })
        .prefault({})
    })
    .prefault({}),
  /** Data folder: holds the SQLite database by default; project folders found here are imported on first start. */
  dataDir: absolutePath.prefault('~/workspace/bpmn-diagrams'),
  storage: z
    .object({
      kind: z.enum(['sqlite', 'postgres']).default('sqlite'),
      /** SQLite database file; defaults to <dataDir>/flowboard.sqlite. */
      sqlitePath: absolutePath.optional(),
      /** Postgres connection string, required when kind is 'postgres'. */
      postgresUrl: z.string().min(1).optional(),
      postgresPoolSize: z.number().int().positive().default(10),
      /** Listen for access changes made on other server instances (needs one more connection). */
      postgresListen: z.boolean().default(true),
      /** When the database has no projects yet, import the project folders found in dataDir. */
      importOnFirstStart: z.boolean().default(true)
    })
    .prefault({}),
  /** Folder with the browser app (HTML, JS, CSS, vendored libraries). */
  publicDir: absolutePath,
  /** Third-party license list served at /licenses. */
  licensesFile: absolutePath.optional(),
  llm: z
    .object({
      /**
       * personal: every provider needs the user's own key (the server pays for nothing).
       * managed: the organization configures providers and their credentials.
       */
      mode: z.enum(['personal', 'managed']).default('personal'),
      /** The providers users can choose from; defaults depend on the mode (see llm/catalog.ts). */
      providers: z.array(providerSchema).optional()
    })
    .prefault({}),
  chat: z
    .object({
      enabled: z.boolean().default(true),
      /** Text added to the assistant's system prompt (chat/prompts/bpmn-assistant.md), e.g. modeling conventions. */
      systemPromptAppend: z.string().max(20000).default(''),
      /** How long the assistant waits for the browser to run one of its tools. */
      toolTimeoutMs: z.number().int().min(100).default(30_000),
      /** Provider calls per turn (each tool round trip is one more). */
      maxIterations: z.number().int().min(1).max(100).default(20),
      /** Turns one user may have running at the same time, across conversations and server instances. */
      maxActiveTurnsPerUser: z.number().int().min(1).default(8),
      /** Conversations without activity for this many days are deleted. */
      idleDays: z.number().int().min(1).default(30),
      /** Each chat gets a working directory below this folder. */
      workDir: absolutePath.prefault(path.join(os.tmpdir(), 'bpmn-chat')),
      claudeCode: z
        .object({
          bin: z.string().min(1).default('claude'),
          model: z.string().default(''),
          timeoutMs: z.number().int().positive().default(5 * 60 * 1000)
        })
        .prefault({})
    })
    .prefault({})
});

export const configSchema = baseSchema
  .refine((c) => c.storage.kind !== 'postgres' || c.storage.postgresUrl, {
    message: 'storage.postgresUrl (DATABASE_URL) is required for Postgres storage',
    path: ['storage', 'postgresUrl']
  })
  .refine((c) => c.auth.kind !== 'trusted-headers' || c.auth.trustedHeaders.proxySecret || c.auth.trustedHeaders.trustedProxies.length, {
    message: 'trusted-headers auth needs a way to verify the proxy: proxySecret (AUTH_PROXY_SECRET) or trustedProxies (AUTH_TRUSTED_PROXIES); ' +
      'otherwise anyone who reaches the server directly could send any identity',
    path: ['auth', 'trustedHeaders']
  })
  .refine((c) => c.auth.kind !== 'oidc' || (c.auth.oidc.issuer && c.auth.oidc.clientId && c.publicOrigin), {
    message: 'oidc auth needs OIDC_ISSUER, OIDC_CLIENT_ID and PUBLIC_ORIGIN (the callback is <PUBLIC_ORIGIN>/auth/callback)',
    path: ['auth', 'oidc']
  })
  .refine((c) => c.llm.mode !== 'personal' || (c.llm.providers ?? []).every((p) => p.credentials.from === 'user-key'), {
    message: "in personal mode every AI provider must use the user's own key (credentials.from = 'user-key'); use LLM_MODE=managed for others",
    path: ['llm', 'providers']
  })
  .refine((c) => new Set((c.llm.providers ?? []).map((p) => p.id)).size === (c.llm.providers ?? []).length, {
    message: 'AI provider ids must be unique',
    path: ['llm', 'providers']
  })
  .transform((c) => ({
    ...c,
    storage: { ...c.storage, sqlitePath: c.storage.sqlitePath ?? path.join(c.dataDir, 'flowboard.sqlite') },
    llm: {
      mode: c.llm.mode,
      providers: (c.llm.providers ?? (c.llm.mode === 'personal' ? DEFAULT_PERSONAL_PROVIDERS : [])) as ProviderEntry[]
    }
  }));

export type ConfigInput = z.input<typeof configSchema>;
export type Config = z.output<typeof configSchema>;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type PartialConfigInput = DeepPartial<ConfigInput>;

/** Identity helper that gives a config module type checking and editor completion. */
export const defineConfig = (config: PartialConfigInput): PartialConfigInput => config;

export function parseConfig(input: unknown): Config {
  const result = configSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Settings from environment variables; unset variables are left out so they don't override other sources. */
export function configFromEnv(env: NodeJS.ProcessEnv): PartialConfigInput {
  const number = (name: string) => {
    const value = env[name];
    if (!value) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Invalid configuration: ${name} must be a number, got "${value}"`);
    return n;
  };
  const json = (name: string) => {
    try {
      return JSON.parse(env[name]!);
    } catch {
      throw new Error(`Invalid configuration: ${name} must be valid JSON`);
    }
  };
  return {
    port: number('PORT'),
    host: env.HOST || undefined,
    dataDir: env.BPMN_DIR || undefined,
    publicOrigin: env.PUBLIC_ORIGIN || undefined,
    appSecret: env.APP_SECRET || undefined,
    auth: {
      // validated by the schema; an unknown value fails there with a readable message
      kind: (env.AUTH || undefined) as 'dev' | 'trusted-headers' | 'oidc' | undefined,
      sessionDays: number('SESSION_DAYS'),
      oidc: {
        issuer: env.OIDC_ISSUER || undefined,
        clientId: env.OIDC_CLIENT_ID || undefined,
        clientSecret: env.OIDC_CLIENT_SECRET || undefined,
        scopes: env.OIDC_SCOPES || undefined,
        allowedEmailDomains: env.OIDC_ALLOWED_DOMAINS ? env.OIDC_ALLOWED_DOMAINS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : undefined
      },
      trustedHeaders: {
        subjectHeader: env.AUTH_SUBJECT_HEADER?.toLowerCase() || undefined,
        nameHeader: env.AUTH_NAME_HEADER?.toLowerCase() || undefined,
        emailHeader: env.AUTH_EMAIL_HEADER?.toLowerCase() || undefined,
        proxySecretHeader: env.AUTH_PROXY_SECRET_HEADER?.toLowerCase() || undefined,
        tokenHeader: env.AUTH_TOKEN_HEADER?.toLowerCase() || undefined,
        proxySecret: env.AUTH_PROXY_SECRET || undefined,
        trustedProxies: env.AUTH_TRUSTED_PROXIES ? env.AUTH_TRUSTED_PROXIES.split(',').map((s) => s.trim()).filter(Boolean) : undefined
      }
    },
    storage: {
      kind: env.STORAGE === 'sqlite' || env.STORAGE === 'postgres' ? env.STORAGE : env.DATABASE_URL ? 'postgres' : undefined,
      sqlitePath: env.SQLITE_PATH || undefined,
      postgresUrl: env.DATABASE_URL || undefined,
      postgresPoolSize: number('PG_POOL_SIZE'),
      postgresListen: env.PG_LISTEN ? env.PG_LISTEN !== 'off' : undefined,
      importOnFirstStart: env.IMPORT_ON_FIRST_START ? env.IMPORT_ON_FIRST_START !== 'off' : undefined
    },
    llm: {
      mode: (env.LLM_MODE || undefined) as 'personal' | 'managed' | undefined,
      providers: env.LLM_PROVIDERS ? json('LLM_PROVIDERS') : undefined
    },
    chat: {
      enabled: env.CHAT ? env.CHAT !== 'off' : undefined,
      systemPromptAppend: env.CHAT_SYSTEM_PROMPT_APPEND || undefined,
      toolTimeoutMs: number('CHAT_TOOL_TIMEOUT_MS'),
      idleDays: number('CHAT_IDLE_DAYS'),
      claudeCode: {
        bin: env.CLAUDE_BIN || undefined,
        model: env.CLAUDE_MODEL || undefined,
        timeoutMs: number('CHAT_TIMEOUT_MS')
      }
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges plain objects; later sources win, `undefined` values are ignored. */
export function mergeConfig(...sources: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeConfig(out[key], value) : value;
    }
  }
  return out;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  /** Defaults supplied by the entry point, e.g. where the browser app lives. */
  defaults?: PartialConfigInput;
  /** Values that win over every other source. */
  overrides?: PartialConfigInput;
}

/**
 * Builds the configuration from, in increasing priority: built-in defaults, `defaults`,
 * the module named by APP_CONFIG (its default export), environment variables, `overrides`.
 */
export async function loadConfigFromEnv(options: LoadConfigOptions = {}): Promise<Config> {
  const env = options.env ?? process.env;
  let fromModule: unknown = {};
  if (env.APP_CONFIG) {
    const mod = await import(pathToFileURL(path.resolve(expandHome(env.APP_CONFIG))).href);
    fromModule = mod.default ?? {};
  }
  return parseConfig(mergeConfig(options.defaults, fromModule, configFromEnv(env), options.overrides));
}
