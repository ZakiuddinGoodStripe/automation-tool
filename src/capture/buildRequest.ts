import type { FieldRequest } from './types';

/** Reads each context value from the URL's query string; params absent from the URL are omitted. */
export function extractContext(url: string, params: Record<string, string> = {}): Record<string, string> {
  const search = new URL(url).searchParams;
  const context: Record<string, string> = {};
  for (const [contextKey, param] of Object.entries(params)) {
    const value = search.get(param);
    if (value) context[contextKey] = value;
  }
  return context;
}

export function buildRequest(
  captureId: string,
  formType: string,
  context: Record<string, string>,
  boundKeys: Iterable<string>,
): FieldRequest {
  return { captureId, formType, context, keys: [...boundKeys] };
}
