export type Mode = 'demo' | 'live';

export interface Settings {
  /** "demo" = canned data, nothing leaves the browser. "live" = the hospital system. */
  mode: Mode;
  /** The hospital system's endpoint. */
  endpointUrl: string;
  /** Sent as a bearer token. Read only by the background worker; the UI never reads it back. */
  apiKey: string;
  /** Show what will be sent and wait for a click before sending. */
  previewBeforeSend: boolean;
}

/** What the side panel may see: never the key itself. */
export type PublicSettings = Omit<Settings, 'apiKey'> & { hasApiKey: boolean };

export const DEFAULT_SETTINGS: Settings = {
  mode: 'demo',
  endpointUrl: '',
  apiKey: '',
  previewBeforeSend: true,
};

export function toPublic(settings: Settings): PublicSettings {
  const { apiKey, ...rest } = settings;
  return { ...rest, hasApiKey: apiKey.length > 0 };
}

/** Storage can hold anything (old versions, hand edits); never trust its shape. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    mode: r.mode === 'live' ? 'live' : 'demo',
    endpointUrl: typeof r.endpointUrl === 'string' ? r.endpointUrl : '',
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    previewBeforeSend: typeof r.previewBeforeSend === 'boolean' ? r.previewBeforeSend : true,
  };
}

export type EndpointCheck =
  | { ok: true; url: string; host: string; originPattern: string }
  | { ok: false; error: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The endpoint must be HTTPS (plain HTTP only for a local test server) and
 * carry no credentials in the URL. Returns the match pattern the extension
 * must be granted before it may call that host.
 */
export function validateEndpoint(input: string): EndpointCheck {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Enter the hospital system URL.' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'That is not a valid URL. Example: https://api.hospital.example/chartfill' };
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return { ok: false, error: 'The URL must start with https:// (plain http is only allowed for localhost).' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Do not put a username or password in the URL. Use the API key field.' };
  }
  url.hash = '';
  return {
    ok: true,
    url: url.toString(),
    host: url.host,
    originPattern: `${url.protocol}//${url.hostname}/*`,
  };
}
