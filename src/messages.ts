import type { CapturedSchema } from './capture/types';
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

export type CaptureSchemaResponse =
  | { ok: true; schema: CapturedSchema }
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
  schema: CapturedSchema;
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
