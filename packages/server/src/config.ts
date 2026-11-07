import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

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

const baseSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().min(1).default('0.0.0.0'),
  /** Public address of the app, e.g. https://bpmn.example.com; used for cookies, CSRF checks and redirects. */
  publicOrigin: origin.optional(),
  auth: z
    .object({
      /**
       * dev: sign in with just a name, no password (trusted networks only).
       * trusted-headers: identity comes from headers set by an authenticating reverse proxy.
       */
      kind: z.enum(['dev', 'trusted-headers']).default('dev'),
      sessionDays: z.number().int().positive().default(30),
      trustedHeaders: z
        .object({
          subjectHeader: z.string().min(1).default('x-forwarded-user'),
          nameHeader: z.string().min(1).optional(),
          emailHeader: z.string().min(1).optional(),
          /** The proxy proves itself with this header and secret ... */
          proxySecretHeader: z.string().min(1).default('x-proxy-secret'),
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
      /** When the database has no projects yet, import the project folders found in dataDir. */
      importOnFirstStart: z.boolean().default(true)
    })
    .prefault({}),
  /** Folder with the browser app (HTML, JS, CSS, vendored libraries). */
  publicDir: absolutePath,
  /** Third-party license list served at /licenses. */
  licensesFile: absolutePath.optional(),
  chat: z
    .object({
      enabled: z.boolean().default(true),
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
  .transform((c) => ({
    ...c,
    storage: { ...c.storage, sqlitePath: c.storage.sqlitePath ?? path.join(c.dataDir, 'flowboard.sqlite') }
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
  return {
    port: number('PORT'),
    host: env.HOST || undefined,
    dataDir: env.BPMN_DIR || undefined,
    publicOrigin: env.PUBLIC_ORIGIN || undefined,
    auth: {
      // validated by the schema; an unknown value fails there with a readable message
      kind: (env.AUTH || undefined) as 'dev' | 'trusted-headers' | undefined,
      sessionDays: number('SESSION_DAYS'),
      trustedHeaders: {
        subjectHeader: env.AUTH_SUBJECT_HEADER?.toLowerCase() || undefined,
        nameHeader: env.AUTH_NAME_HEADER?.toLowerCase() || undefined,
        emailHeader: env.AUTH_EMAIL_HEADER?.toLowerCase() || undefined,
        proxySecretHeader: env.AUTH_PROXY_SECRET_HEADER?.toLowerCase() || undefined,
        proxySecret: env.AUTH_PROXY_SECRET || undefined,
        trustedProxies: env.AUTH_TRUSTED_PROXIES ? env.AUTH_TRUSTED_PROXIES.split(',').map((s) => s.trim()).filter(Boolean) : undefined
      }
    },
    storage: {
      kind: env.STORAGE === 'sqlite' || env.STORAGE === 'postgres' ? env.STORAGE : env.DATABASE_URL ? 'postgres' : undefined,
      sqlitePath: env.SQLITE_PATH || undefined,
      postgresUrl: env.DATABASE_URL || undefined,
      postgresPoolSize: number('PG_POOL_SIZE'),
      importOnFirstStart: env.IMPORT_ON_FIRST_START ? env.IMPORT_ON_FIRST_START !== 'off' : undefined
    },
    chat: {
      enabled: env.CHAT ? env.CHAT !== 'off' : undefined,
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
