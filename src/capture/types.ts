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
}
