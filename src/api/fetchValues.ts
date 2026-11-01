import type { FieldRequest, FieldResponse, FieldValue } from '../capture/types';
import { validateEndpoint, type Settings } from '../settings/settings';

export interface FetchValuesResult {
  /** "demo" = canned data from the mock provider; "api" = the hospital system. */
  source: 'demo' | 'api';
  response: FieldResponse;
}

/** Everything that touches the browser or network, injected so this module is testable. */
export interface FetchDeps {
  loadSettings(): Promise<Settings>;
  /** Whether the extension has been granted access to the host behind this match pattern. */
  hasPermission(originPattern: string): Promise<boolean>;
  fetch: typeof fetch;
  /** Give up on the hospital system after this long. Default 15 s. */
  timeoutMs?: number;
}

/** Carries a message that is safe and useful to show the operator. Never contains request or response data. */
export class FetchValuesError extends Error {}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Canned values for the exam form, keyed by the same keys as examForm.config.ts.
 * Codes are what the hospital system will send (plain CPT and modifier codes);
 * the extension resolves them to the page's own options. `diabeticRetinopathy`,
 * `pcpForm` and the PQRS row are deliberately absent so the demo shows the
 * "no data" path.
 */
const DEMO_EXAM_VALUES: Record<string, string | boolean | string[]> = {
  provider: 'Dr. Priya Bhuta',
  'diagnosis.A': 'H40.1131',
  'diagnosis.B': 'E11.9',
  'exam.cpt': '92004',
  'exam.diagnoses': ['A', 'B'],
  'exam.modifiers': ['25'],
  'fitting.cpt': '92310',
  'procedure.cpt': '92134',
  'procedure.diagnoses': ['A'],
  'procedure.modifiers': ['RT'],
  dilationPerformed: 'Yes',
  preDiabetes: false,
  diabetes: true,
  highCholesterol: true,
  hypertension: true,
  abnormalPupil: false,
  arcus: false,
  armd: false,
  cataract: true,
  glaucoma: true,
};

function demoValues(request: FieldRequest): FetchValuesResult {
  const values: FieldResponse['values'] = {};
  for (const key of request.keys) {
    const value = DEMO_EXAM_VALUES[key];
    values[key] = value === undefined ? null : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
  }
  return { source: 'demo', response: { captureId: request.captureId, values } };
}

function isFieldValue(v: unknown): v is FieldValue {
  return typeof v === 'string' || typeof v === 'boolean' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
}

/** Checks the hospital system's answer before anything on the page can act on it. */
export function parseResponse(body: unknown, request: FieldRequest): FieldResponse {
  if (typeof body !== 'object' || body === null) {
    throw new FetchValuesError('The hospital system sent a response we could not read.');
  }
  const { captureId, values } = body as { captureId?: unknown; values?: unknown };
  if (captureId !== request.captureId) {
    throw new FetchValuesError('The hospital system answered a different request. Nothing was filled.');
  }
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new FetchValuesError('The hospital system response is missing its "values".');
  }
  const clean: FieldResponse['values'] = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && !isFieldValue(value)) {
      // Name the field, never print its value.
      throw new FetchValuesError(`The hospital system sent an invalid value for "${key}".`);
    }
    clean[key] = value;
  }
  return { captureId, values: clean };
}

async function postRequest(request: FieldRequest, settings: Settings, deps: FetchDeps): Promise<FieldResponse> {
  const endpoint = validateEndpoint(settings.endpointUrl);
  if (!endpoint.ok) throw new FetchValuesError(`Settings: ${endpoint.error}`);
  if (!settings.apiKey) throw new FetchValuesError('No API key is saved. Add it in Settings.');
  if (!(await deps.hasPermission(endpoint.originPattern))) {
    throw new FetchValuesError(`ChartFill is not allowed to contact ${endpoint.host}. Open Settings and save again to grant access.`);
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await deps.fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      // Never follow a redirect: it could carry the API key to another host.
      redirect: 'error',
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FetchValuesError(`The hospital system did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw new FetchValuesError(`Could not reach the hospital system at ${endpoint.host}. Check the URL and your network.`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new FetchValuesError('The hospital system rejected the API key.');
  }
  if (res.status === 404) {
    throw new FetchValuesError('The hospital system has no data for this record.');
  }
  if (res.status >= 500) {
    throw new FetchValuesError(`The hospital system reported an error (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new FetchValuesError(`The hospital system refused the request (HTTP ${res.status}).`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new FetchValuesError('The hospital system sent a response we could not read.');
  }
  return parseResponse(body, request);
}

/**
 * Where field values come from. Demo mode returns canned data and sends
 * nothing anywhere; live mode POSTs the request (keys and record ids only) to
 * the hospital system. Runs in the background worker only, so the API key
 * never reaches the page.
 */
export async function fetchValues(request: FieldRequest, deps: FetchDeps): Promise<FetchValuesResult> {
  const settings = await deps.loadSettings();
  if (settings.mode === 'demo') return demoValues(request);
  return { source: 'api', response: await postRequest(request, settings, deps) };
}

/**
 * Sends an empty request (no keys, no record) to check the URL, key and
 * permission end to end. The hospital system should answer 200 with empty values.
 */
export async function testConnection(deps: FetchDeps): Promise<{ ms: number }> {
  const settings = await deps.loadSettings();
  const started = Date.now();
  const request: FieldRequest = {
    captureId: crypto.randomUUID(),
    formType: 'connectionTest',
    context: {},
    keys: [],
  };
  await postRequest(request, { ...settings, mode: 'live' }, deps);
  return { ms: Date.now() - started };
}
