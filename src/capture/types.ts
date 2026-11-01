export type CapturedElementType = 'input' | 'select' | 'textarea';

export interface CapturedFieldOption {
  value: string;
  text: string;
}

/**
 * How a <select> is filled from a returned value.
 * "text": exact option value or text. "code": match the leading code of "92004 - Comprehensive Exam - New".
 * "search": options only exist after typing in a live-search box (diagnosis codes); the code is typed and the result clicked.
 * "pointer": a procedure row's diagnosis list; values are the letters (A, B, ...) of the diagnoses entered above.
 */
export type FieldDriver = 'text' | 'code' | 'search' | 'pointer';

export interface CapturedField {
  /** Stable-ish key derived from the field's label, used by the API to key its response. */
  key: string;
  /** Best-effort human-readable label for this field. */
  label: string;
  /** CSS selector that resolves back to this exact element on this page. */
  selector: string;
  elementType: CapturedElementType;
  /** input[type], when elementType is "input". */
  inputType?: string;
  currentValue: string;
  /** Present only for <select> fields. */
  options?: CapturedFieldOption[];
  /** Set for fields bound from the form config; defaults to "text" matching. */
  driver?: FieldDriver;
  /** Most options a multi-select may hold (e.g. "Select up to 4"). */
  maxSelections?: number;
}

export interface CapturedSchema {
  formType: string | null;
  url: string;
  capturedAt: string;
  fields: CapturedField[];
  /** Candidate fields dropped because no unique selector could be built. Flags capture gaps. */
  skipped: number;
}

/**
 * What goes to the DB/API: identifiers only. No selectors, labels, or
 * current values. `captureId` ties the response back to this exact capture.
 */
export interface FieldRequest {
  captureId: string;
  formType: string;
  /** Identifies the record (e.g. patientId), read from the page URL per the form config. */
  context: Record<string, string>;
  /** Canonical field keys (from the form config) the DB should return values for. */
  keys: string[];
}

export type FieldValue = string | boolean | string[];

/** What the DB/API must return. A key that is absent or null means "no data": leave the field blank. */
export interface FieldResponse {
  captureId: string;
  values: Record<string, FieldValue | null>;
}
