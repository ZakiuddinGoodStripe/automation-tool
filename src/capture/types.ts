export type CapturedElementType = 'input' | 'select' | 'textarea';

export interface CapturedFieldOption {
  value: string;
  text: string;
}

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
