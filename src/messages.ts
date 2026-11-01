import type { FieldRequest, FieldResponse } from './capture/types';
import type { FetchValuesResult } from './api/fetchValues';
import type { FieldResult } from './capture/applyWrites';

export interface DetectFormRequest {
  type: 'DETECT_FORM';
}

export type DetectFormResponse = { formType: string | null };

export function isDetectFormRequest(message: unknown): message is DetectFormRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'DETECT_FORM'
  );
}

export interface CaptureSchemaRequest {
  type: 'CAPTURE_SCHEMA';
}

/** Why some configured keys aren't in the request; surfaced so gaps are visible, not silent. */
export interface CaptureReport {
  /** Fields discovered on the page before binding. */
  discovered: number;
  /** Keys whose label matched nothing on this page. */
  missing: string[];
  /** Keys that matched more than one field and were therefore not bound. */
  ambiguous: string[];
  /** key -> name shown to the operator. */
  labels: Record<string, string>;
}

export type CaptureSchemaResponse =
  | { ok: true; request: FieldRequest; report: CaptureReport }
  | { ok: false; error: string };

export function isCaptureSchemaRequest(message: unknown): message is CaptureSchemaRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'CAPTURE_SCHEMA'
  );
}

export interface FetchValuesRequest {
  type: 'FETCH_VALUES';
  request: FieldRequest;
}

export type FetchValuesResponse =
  | { ok: true; result: FetchValuesResult }
  | { ok: false; error: string };

export function isFetchValuesRequest(message: unknown): message is FetchValuesRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'FETCH_VALUES'
  );
}

export interface ApplyFillRequest {
  type: 'APPLY_FILL';
  response: FieldResponse;
}

export interface FillReport {
  results: FieldResult[];
  /** Requested keys the data source had nothing for; the fields stay blank. */
  noData: string[];
  /** Keys that could not be bound to a single page field at capture time. */
  notBound: string[];
  /** key -> name shown to the operator, for keys that have no field result (no data, not bound). */
  labels: Record<string, string>;
}

export type ApplyFillResponse = { ok: true; report: FillReport } | { ok: false; error: string };

export function isApplyFillRequest(message: unknown): message is ApplyFillRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'APPLY_FILL'
  );
}

export interface UndoFillRequest {
  type: 'UNDO_FILL';
  /** Omit to undo every field written by the last fill. */
  keys?: string[];
}

export type UndoFillResponse = { ok: true; restored: string[] } | { ok: false; error: string };

export function isUndoFillRequest(message: unknown): message is UndoFillRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'UNDO_FILL'
  );
}

export interface TestConnectionRequest {
  type: 'TEST_CONNECTION';
}

export type TestConnectionResponse = { ok: true; ms: number } | { ok: false; error: string };

export function isTestConnectionRequest(message: unknown): message is TestConnectionRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'TEST_CONNECTION'
  );
}

/** Sent by the page script to the side panel after each field, so the operator watches the form fill in. */
export interface FillProgressMessage {
  type: 'FILL_PROGRESS';
  captureId: string;
  /** Results reported so far, including this one. */
  done: number;
  total: number;
  result: FieldResult;
}

export function isFillProgress(message: unknown): message is FillProgressMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'FILL_PROGRESS'
  );
}
