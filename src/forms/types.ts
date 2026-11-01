import type { FieldDriver } from '../capture/types';

export interface FormMatch {
  /** Regex source tested against the page URL. Primary signal - most EHR routes are form-specific. */
  urlPattern: string;
  /**
   * Optional CSS selector that must also exist on the page to confirm the
   * match. Use this when a URL pattern alone could be ambiguous; omit it
   * when the route already uniquely identifies the form.
   */
  domSignature?: string;
}

/**
 * One field the DB can supply. Bound to the page either by `selector` (a
 * stable CSS selector, preferred when the page has stable ids or row hooks) or
 * by `label`. When both are given, `selector` wins.
 */
export interface FieldSpec {
  /** Canonical key. This is the contract with the DB: never derive it from page text. */
  key: string;
  /** Regex source (case-insensitive) tested against the normalized page label. Anchor it (^...$). */
  label?: string;
  /** CSS selector that must match exactly one element. Works for fields capture skips, such as disabled ones. */
  selector?: string;
  /** Name shown to the operator in the review list. Defaults to the key. */
  title?: string;
  /** How <select> options are matched to the returned value. Defaults to exact value/text. */
  driver?: FieldDriver;
  /** Most options a multi-select may hold. */
  maxSelections?: number;
}

export interface FormConfig {
  /** Unique identifier for this form type, e.g. "examForm". */
  formType: string;
  match: FormMatch;
  /** CSS selector of the container holding the form; fields outside it are never scanned. */
  scope?: string;
  /** The finite set of fields the DB can fill. Only these keys are ever requested or written. */
  fields: FieldSpec[];
  /** Request-context key -> URL query parameter it is read from, e.g. { patientId: 'id' }. */
  context?: Record<string, string>;
}
