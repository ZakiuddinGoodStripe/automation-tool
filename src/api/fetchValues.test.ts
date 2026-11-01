import { describe, expect, it, vi } from 'vitest';
import { fetchValues, testConnection, FetchValuesError, type FetchDeps } from './fetchValues';
import { DEFAULT_SETTINGS, type Settings } from '../settings/settings';
import type { FieldRequest } from '../capture/types';

const request: FieldRequest = {
  captureId: 'cap-1',
  formType: 'examForm',
  context: { patientId: '3717251' },
  keys: ['provider', 'exam.cpt', 'pcpForm'],
};

const live: Settings = {
  ...DEFAULT_SETTINGS,
  mode: 'live',
  endpointUrl: 'https://api.hospital.example/chartfill',
  apiKey: 'secret-key',
};

function deps(over: Partial<FetchDeps> & { settings?: Settings } = {}): FetchDeps {
  return {
    loadSettings: async () => over.settings ?? live,
    hasPermission: async () => true,
    fetch: over.fetch ?? (async () => json({ captureId: 'cap-1', values: { provider: 'Dr. Priya Bhuta', 'exam.cpt': '92004', pcpForm: null } })),
    timeoutMs: over.timeoutMs,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(FetchValuesError);
    return (e as Error).message;
  }
  throw new Error('expected a failure');
}

describe('fetchValues', () => {
  it('demo mode returns canned data and never calls the network', async () => {
    const fetchSpy = vi.fn();
    const out = await fetchValues(request, deps({ settings: DEFAULT_SETTINGS, fetch: fetchSpy as unknown as typeof fetch }));
    expect(out.source).toBe('demo');
    expect(out.response.captureId).toBe('cap-1');
    expect(out.response.values['pcpForm']).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('live mode posts only the request, with the key as a bearer token and no redirects or cookies', async () => {
    const fetchSpy = vi.fn(async () => json({ captureId: 'cap-1', values: { provider: 'Dr. Priya Bhuta' } }));
    const out = await fetchValues(request, deps({ fetch: fetchSpy as unknown as typeof fetch }));
    expect(out.source).toBe('api');
    expect(out.response.values).toEqual({ provider: 'Dr. Priya Bhuta' });

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.hospital.example/chartfill');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-key');
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
  });

  it('refuses to run live without a valid URL, a key, or host permission', async () => {
    expect(await failure(fetchValues(request, deps({ settings: { ...live, endpointUrl: 'http://api.hospital.example' } })))).toMatch(/https/);
    expect(await failure(fetchValues(request, deps({ settings: { ...live, apiKey: '' } })))).toMatch(/API key/);
    const noPermission: FetchDeps = { ...deps(), hasPermission: async () => false };
    expect(await failure(fetchValues(request, noPermission))).toMatch(/not allowed to contact api\.hospital\.example/);
  });

  it('turns HTTP failures into clear messages', async () => {
    const status = (code: number) => failure(fetchValues(request, deps({ fetch: (async () => json({}, code)) as unknown as typeof fetch })));
    expect(await status(401)).toMatch(/rejected the API key/);
    expect(await status(403)).toMatch(/rejected the API key/);
    expect(await status(404)).toMatch(/no data for this record/);
    expect(await status(503)).toMatch(/HTTP 503/);
    expect(await status(422)).toMatch(/HTTP 422/);
  });

  it('reports network failure and timeout', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await failure(fetchValues(request, deps({ fetch: down })))).toMatch(/Could not reach the hospital system at api\.hospital\.example/);

    const hang = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    expect(await failure(fetchValues(request, deps({ fetch: hang, timeoutMs: 50 })))).toMatch(/did not answer within/);
  });

  it('rejects answers that are malformed, for another capture, or carry bad values', async () => {
    const answer = (body: unknown) => failure(fetchValues(request, deps({ fetch: (async () => json(body)) as unknown as typeof fetch })));
    expect(await answer('nope')).toMatch(/could not read/);
    expect(await answer({ captureId: 'other', values: {} })).toMatch(/different request/);
    expect(await answer({ captureId: 'cap-1' })).toMatch(/missing its "values"/);
    expect(await answer({ captureId: 'cap-1', values: ['x'] })).toMatch(/missing its "values"/);
    const message = await answer({ captureId: 'cap-1', values: { 'exam.cpt': { code: '92004' } } });
    expect(message).toMatch(/invalid value for "exam.cpt"/);
    expect(message).not.toMatch(/92004/);
  });

  it('reports a body that is not JSON', async () => {
    const html = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    expect(await failure(fetchValues(request, deps({ fetch: html })))).toMatch(/could not read/);
  });
});

describe('testConnection', () => {
  it('sends an empty request and reports the round trip', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string) as FieldRequest;
      return json({ captureId: sent.captureId, values: {} });
    });
    const out = await testConnection(deps({ settings: { ...live, mode: 'demo' }, fetch: fetchSpy as unknown as typeof fetch }));
    expect(out.ms).toBeGreaterThanOrEqual(0);
    const sent = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as FieldRequest;
    expect(sent).toMatchObject({ formType: 'connectionTest', context: {}, keys: [] });
  });

  it('fails like a normal call when the key is wrong', async () => {
    const wrongKey = (async () => json({}, 401)) as unknown as typeof fetch;
    expect(await failure(testConnection(deps({ fetch: wrongKey })))).toMatch(/rejected the API key/);
  });
});
