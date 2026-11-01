import type { CapturedField, FieldRequest, FieldResponse, FieldValue } from './types';

export interface PlannedWrite {
  key: string;
  field: CapturedField;
  value: FieldValue;
}

export interface WriteBackPlan {
  /** Set when the response can't be trusted at all; `writes` is then empty. */
  error?: string;
  writes: PlannedWrite[];
  /** Requested keys the DB returned nothing for: fields stay blank. */
  noData: string[];
  /** Keys in the response that were never requested or aren't bound locally: ignored, never written. */
  unexpected: string[];
}

/**
 * Turns the DB response into the exact writes to perform. A value is only
 * ever written to a field that was bound at capture time AND requested, so
 * a stray, renamed or stale key can't land on the wrong field.
 */
export function planWriteBack(
  request: FieldRequest,
  bound: Map<string, CapturedField>,
  response: FieldResponse,
): WriteBackPlan {
  if (response.captureId !== request.captureId) {
    return { error: 'Response is for a different capture.', writes: [], noData: [], unexpected: [] };
  }

  const requested = new Set(request.keys);
  const writes: PlannedWrite[] = [];
  const noData: string[] = [];

  for (const key of request.keys) {
    const value = response.values[key];
    const field = bound.get(key);
    if (value === undefined || value === null || !field) noData.push(key);
    else writes.push({ key, field, value });
  }

  const unexpected = Object.keys(response.values).filter((k) => !requested.has(k));
  return { writes, noData, unexpected };
}
