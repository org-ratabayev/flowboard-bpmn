// The AI providers users can choose from. The server configuration defines the list; users
// cannot add providers or URLs of their own.
//
//   personal  (default) every provider needs the user's own key; the server pays for nothing
//   managed   the organization configures providers; credentials come from a server secret,
//             from the signed-in user's own token, or from an adapter function (APP_CONFIG)

import { createAnthropicProvider } from './anthropic.ts';
import { createOpenAiCompatibleProvider } from './openai.ts';
import type { Credentials, LlmProvider } from './types.ts';

export type CredentialSource = 'user-key' | 'server' | 'identity' | 'adapter';

/** What an adapter gets to decide the credentials of one request. */
export interface AdapterContext {
  user: { id: string; provider: string; subject: string; name: string; email: string | null };
  /** The user's token from the sign-in (e.g. forwarded by the authenticating proxy), if any. */
  upstreamToken: string | null;
  providerId: string;
}

/** Returns the credentials for one request, or null when this user cannot use the provider. */
export type CredentialsAdapter = (context: AdapterContext) => Promise<Credentials | null> | Credentials | null;

export interface ProviderEntry {
  id: string;
  label: string;
  type: 'anthropic' | 'openai-compatible';
  baseUrl?: string;
  /** Models offered to users; empty means "ask the provider". */
  models: string[];
  defaultModel?: string;
  credentials:
    | { from: 'user-key' }
    | { from: 'server'; secretEnv: string }
    | { from: 'identity' }
    | { from: 'adapter'; adapter: CredentialsAdapter };
  /** Extra headers sent with every request (e.g. an app identifier a gateway expects). */
  headers: Record<string, string>;
  /** Header that carries the user's subject, for gateways that count usage per user. */
  userIdHeader?: string;
}

export const DEFAULT_PERSONAL_PROVIDERS: ProviderEntry[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    type: 'anthropic',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
    defaultModel: 'claude-sonnet-5-5',
    credentials: { from: 'user-key' },
    headers: {}
  },
  {
    id: 'openai',
    label: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    models: [],
    credentials: { from: 'user-key' },
    headers: {}
  }
];

export interface ProviderSummary {
  id: string;
  label: string;
  type: ProviderEntry['type'];
  models: string[];
  defaultModel: string | null;
  credentials: CredentialSource;
  /** Whether this user can use it right now; otherwise `reason` says why. */
  ready: boolean;
  reason?: string;
}

export interface RequestContext {
  user: AdapterContext['user'];
  upstreamToken: string | null;
  /** The user's own key for this provider, when they unlocked it for this request. */
  userKey?: string | null;
}

export type Resolved = { credentials: Credentials } | { unavailable: string };

export type LlmCatalog = ReturnType<typeof createCatalog>;

export function createCatalog(entries: ProviderEntry[], env: NodeJS.ProcessEnv = process.env) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const clients = new Map<string, LlmProvider>(entries.map((entry) => [
    entry.id,
    entry.type === 'anthropic'
      ? createAnthropicProvider({ baseUrl: entry.baseUrl })
      : createOpenAiCompatibleProvider({ baseUrl: entry.baseUrl! })
  ]));

  async function resolve(entry: ProviderEntry, context: RequestContext): Promise<Resolved> {
    const extra: Record<string, string> = { ...entry.headers };
    if (entry.userIdHeader) extra[entry.userIdHeader] = context.user.subject;
    const withExtra = (credentials: Credentials): Resolved => ({ credentials: { ...credentials, headers: { ...extra, ...credentials.headers } } });

    switch (entry.credentials.from) {
      case 'user-key':
        return context.userKey ? withExtra({ apiKey: context.userKey }) : { unavailable: 'Add your own key for this provider in Settings' };
      case 'server': {
        const secret = env[entry.credentials.secretEnv];
        return secret ? withExtra({ apiKey: secret }) : { unavailable: 'Not configured on the server' };
      }
      case 'identity':
        return context.upstreamToken ? withExtra({ bearer: context.upstreamToken }) : { unavailable: 'Your sign-in does not provide a token for this provider' };
      case 'adapter': {
        const credentials = await entry.credentials.adapter({ user: context.user, upstreamToken: context.upstreamToken, providerId: entry.id });
        return credentials ? withExtra(credentials) : { unavailable: 'Not available for your account' };
      }
    }
  }

  return {
    entries,
    get: (id: string) => byId.get(id),
    client: (id: string) => clients.get(id),
    resolve,

    /** The providers as a user sees them (never with credentials). */
    async summaries(context: RequestContext): Promise<ProviderSummary[]> {
      return Promise.all(entries.map(async (entry) => {
        // the user-key check only says whether a key could be used; storing keys is separate
        const resolved = entry.credentials.from === 'user-key'
          ? { unavailable: 'Add your own key for this provider in Settings' } as Resolved
          : await resolve(entry, context).catch(() => ({ unavailable: 'Not available right now' }) as Resolved);
        return {
          id: entry.id,
          label: entry.label,
          type: entry.type,
          models: entry.models,
          defaultModel: entry.defaultModel ?? entry.models[0] ?? null,
          credentials: entry.credentials.from,
          ready: 'credentials' in resolved,
          ...('unavailable' in resolved ? { reason: resolved.unavailable } : {})
        };
      }));
    }
  };
}
