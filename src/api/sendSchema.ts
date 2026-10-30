import type { CapturedSchema } from '../capture/types';

export interface SendSchemaResult {
  /** True once this actually talks to the real API; false for the current stub. */
  sentToRealApi: boolean;
  message: string;
}

/**
 * Stub for "send the captured schema to the third-party API and ask for
 * data in this shape." The real API doesn't exist yet - this function is
 * the one place to swap once it does (a fetch() call with the operator's
 * API key, added from the background worker so the key never reaches the
 * content script). Signature is deliberately close to what that call will
 * look like.
 */
export async function sendSchema(schema: CapturedSchema): Promise<SendSchemaResult> {
  // TODO: replace with `fetch(apiUrl, { method: 'POST', headers: { Authorization: ... }, body: JSON.stringify(schema) })`
  // once the third-party API is available, and return its parsed response.
  console.log('[sendSchema] would POST captured schema to the API:', schema);
  return {
    sentToRealApi: false,
    message: 'API not connected yet - this is a stub. Schema was captured and validated, not sent anywhere.',
  };
}
