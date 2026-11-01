import type { FieldRequest } from './capture/types';
import type { SendSchemaResult } from './api/sendSchema';

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

export interface SendSchemaRequest {
  type: 'SEND_SCHEMA';
  request: FieldRequest;
}

export type SendSchemaResponse =
  | { ok: true; result: SendSchemaResult }
  | { ok: false; error: string };

export function isSendSchemaRequest(message: unknown): message is SendSchemaRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'SEND_SCHEMA'
  );
}
