import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const expandHome = (p: string) => p.replace(/^~(?=$|\/)/, os.homedir());
const absolutePath = z.string().min(1).transform((p) => path.resolve(expandHome(p)));

export const configSchema = z.object({
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().min(1).default('0.0.0.0'),
  /** Folder holding all projects and their history. */
  dataDir: absolutePath.prefault('~/workspace/bpmn-diagrams'),
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
