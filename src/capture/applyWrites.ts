import type { PlannedWrite } from './planWriteBack';
import { notify, setNativeValue } from './domEvents';
import { fillSearchSelect, textHasCode } from './searchSelect';
import type { FieldDriver, FieldValue } from './types';

export type FillStatus =
  /** Value written to the field. */
  | 'filled'
  /** Field already held exactly this value. */
  | 'unchanged'
  /** Field already had a different value: left alone, never overwritten. */
  | 'kept'
  /** The selector no longer resolves on the page. */
  | 'notFound'
  /** The value can't be represented in this field (no matching option, ambiguous match, too many selections). */
  | 'invalid'
  /** Field kind we don't write to (radio, file, ...). */
  | 'unsupported'
  /** The field stayed disabled: the field it depends on was not set, so the page never enabled it. */
  | 'notReady';

export interface FieldResult {
  key: string;
  label: string;
  status: FillStatus;
  /** What was written (filled) or what was already there (kept). Shown in the review list. */
  value?: string;
}

export interface UndoEntry {
  key: string;
  selector: string;
  previousValue: string;
  previousChecked: boolean;
  /** Multi-select only: the option values that were selected before. */
  previousSelected?: string[];
}

export interface ApplyResult {
  results: FieldResult[];
  /** Only for fields actually written; feed to undoWrites(). */
  undo: UndoEntry[];
}

export interface ApplyOptions {
  /**
   * How long to wait for a disabled field to become enabled. Dependent fields
   * (a row's modifiers) are enabled by the page only after the field before
   * them (the row's procedure code) is set.
   */
  waitEnabledMs?: number;
  /** How long to wait for a live-search box (diagnosis codes) to return the wanted code. */
  searchTimeoutMs?: number;
  /**
   * How long to wait for diagnosis pointers (A, B, ...) to appear in a row's diagnosis list. The page builds that
   * list from the diagnoses entered above, so it can lag a moment behind the field being enabled.
   */
  optionsWaitMs?: number;
  /** Called with each field's result as soon as it is known, so progress can be shown field by field. */
  onResult?: (result: FieldResult) => void;
  /** Called with the field's selector after its value changed, e.g. so a widget wrapped around it can redraw. */
  onChanged?: (selector: string) => void;
}

type FillElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const DEFAULT_WAIT_ENABLED_MS = 3000;
const DEFAULT_OPTIONS_WAIT_MS = 2000;
const POLL_MS = 50;

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'on', 'checked']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'off', 'unchecked']);

function toBoolean(value: FieldValue): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

function toText(value: FieldValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function resolve(doc: Document, selector: string): FillElement | null {
  try {
    return doc.querySelector(selector) as FillElement | null;
  } catch {
    return null;
  }
}

/** Placeholder options ("Select") carry value "" or "0" on the target pages; a field sitting on one is empty. */
function isPlaceholder(option: HTMLOptionElement | undefined): boolean {
  return !option || option.value === '' || option.value === '0';
}

/** Looks up what another field in this batch is being filled with, e.g. the ICD-10 code behind pointer "A". */
type Lookup = (key: string) => FieldValue | undefined;

/** First word of option text: "A - H40.1131 ..." -> "A"; "H40.1131 - ..." -> "H40.1131". */
function leadingToken(text: string): string {
  return text.trim().split(/[^A-Za-z0-9.]+/)[0] ?? '';
}

/**
 * Options a returned value may refer to. "text": exact option value or text.
 * "code": the option text is "<code> - <description>" (or just the code), so
 * match the leading code only; "92310" must not match "92310.1 - ...".
 * "pointer": a diagnosis pointer letter ("A"). Match the option led by that
 * letter; if the list shows only ICD codes, resolve the letter to the code
 * being filled into diagnosis box A and match that. No match is no guess.
 */
function matchOptions(
  options: HTMLOptionElement[],
  wanted: string,
  driver: FieldDriver = 'text',
  lookup?: Lookup,
): HTMLOptionElement[] {
  const w = wanted.trim().toLowerCase();
  if (w === '') return [];
  if (driver === 'pointer') {
    const letter = w.toUpperCase();
    const byLetter = options.filter((o) => leadingToken(o.text).toUpperCase() === letter || o.value.toUpperCase() === letter);
    if (byLetter.length > 0) return byLetter;
    const icd = lookup?.(`diagnosis.${letter}`);
    return typeof icd === 'string' && icd.trim() !== '' ? options.filter((o) => textHasCode(o.text, icd)) : [];
  }
  return options.filter((o) => {
    const text = o.text.trim().toLowerCase();
    if (driver === 'code') return text === w || text.startsWith(`${w} - `);
    return o.value.toLowerCase() === w || text === w;
  });
}

async function waitUntilEnabled(doc: Document, selector: string, ms: number): Promise<FillElement | null> {
  const deadline = Date.now() + ms;
  for (;;) {
    const el = resolve(doc, selector);
    if (!el) return null;
    if (!el.disabled) return el;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function snapshot(key: string, selector: string, el: FillElement): UndoEntry {
  const entry: UndoEntry = {
    key,
    selector,
    previousValue: el.value,
    previousChecked: (el as HTMLInputElement).checked ?? false,
  };
  if (el.tagName.toLowerCase() === 'select' && (el as HTMLSelectElement).multiple) {
    entry.previousSelected = Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.selected)
      .map((o) => o.value);
  }
  return entry;
}

/**
 * Performs the planned writes in order. Never overwrites a field that already
 * holds a different value, never submits anything, waits for fields the page
 * enables only after an earlier field is set, and records what it changed so
 * the operator can undo it.
 */
export async function applyWrites(
  doc: Document,
  writes: PlannedWrite[],
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const waitMs = options.waitEnabledMs ?? DEFAULT_WAIT_ENABLED_MS;
  const optionsWaitMs = options.optionsWaitMs ?? DEFAULT_OPTIONS_WAIT_MS;
  const byKey = new Map(writes.map((w) => [w.key, w.value]));
  const lookup: Lookup = (key) => byKey.get(key);
  const results: FieldResult[] = [];
  const record = (result: FieldResult) => {
    results.push(result);
    options.onResult?.(result);
  };
  const undo: UndoEntry[] = [];

  for (const { key, field, value } of writes) {
    const base = { key, label: field.label };
    let el = resolve(doc, field.selector);
    if (!el) {
      record({ ...base, status: 'notFound' });
      continue;
    }
    if (el.disabled) {
      el = await waitUntilEnabled(doc, field.selector, waitMs);
      if (!el) {
        record({ ...base, status: 'notReady' });
        continue;
      }
    }
    const entry = snapshot(key, field.selector, el);
    const changed = () => options.onChanged?.(field.selector);
    const tag = el.tagName.toLowerCase();

    if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') {
      const want = toBoolean(value);
      if (want === null) {
        record({ ...base, status: 'invalid', value: toText(value) });
        continue;
      }
      const box = el as HTMLInputElement;
      if (box.checked === want) record({ ...base, status: 'unchanged', value: want ? 'Yes' : 'No' });
      else if (box.checked) record({ ...base, status: 'kept', value: 'Yes' });
      else {
        // Pages bound with Knockout update their model on click, not on change; a click does both.
        box.click();
        if (box.checked) {
          undo.push(entry);
          record({ ...base, status: 'filled', value: 'Yes' });
        } else {
          record({ ...base, status: 'invalid', value: 'Yes' });
        }
      }
      continue;
    }

    if (tag === 'input' && ['radio', 'file', 'password'].includes((el as HTMLInputElement).type)) {
      record({ ...base, status: 'unsupported' });
      continue;
    }

    if (tag === 'select' && field.driver === 'search') {
      if (typeof value !== 'string') {
        record({ ...base, status: 'invalid', value: toText(value) });
        continue;
      }
      const out = await fillSearchSelect(el as HTMLSelectElement, value, { timeoutMs: options.searchTimeoutMs });
      if ('note' in out) {
        record({ ...base, status: out.status, value: out.note });
      } else {
        // The widget redraws itself when its result is clicked, so no refresh is requested here.
        if (out.status === 'filled') undo.push(entry);
        record({ ...base, status: out.status, value: out.text });
      }
      continue;
    }

    if (tag === 'select') {
      const select = el as HTMLSelectElement;
      let all = Array.from(select.options);
      const wanted = Array.isArray(value) ? value : [toText(value)];

      if (select.multiple) {
        if (field.maxSelections !== undefined && wanted.length > field.maxSelections) {
          record({ ...base, status: 'invalid', value: toText(value) });
          continue;
        }
        const resolveAll = () => {
          const picked: HTMLOptionElement[] = [];
          let missing = false;
          let ambiguous = false;
          for (const w of wanted) {
            const hits = matchOptions(Array.from(select.options), w, field.driver, lookup);
            if (hits.length === 0) missing = true;
            else if (hits.length > 1) ambiguous = true;
            else picked.push(hits[0]!);
          }
          return { picked, missing, ambiguous, ok: wanted.length > 0 && !missing && !ambiguous };
        };
        let resolved = resolveAll();
        if (field.driver === 'pointer') {
          // The list is built from the diagnoses entered above and can lag the field being enabled.
          const deadline = Date.now() + optionsWaitMs;
          while (resolved.missing && !resolved.ambiguous && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, POLL_MS));
            resolved = resolveAll();
          }
        }
        if (!resolved.ok) {
          record({ ...base, status: 'invalid', value: toText(value) });
          continue;
        }
        all = Array.from(select.options);
        const picked = resolved.picked;
        const label = (o: HTMLOptionElement) => (field.driver === 'pointer' ? leadingToken(o.text) || o.value : o.value);
        const shown = (field.driver === 'pointer' ? wanted.map((w) => w.trim().toUpperCase()) : picked.map((o) => o.value)).join(', ');
        const selected = all.filter((o) => o.selected);
        const same = selected.length === picked.length && picked.every((o) => o.selected);
        if (same) record({ ...base, status: 'unchanged', value: shown });
        else if (selected.length > 0) record({ ...base, status: 'kept', value: selected.map(label).join(', ') });
        else {
          for (const o of picked) o.selected = true;
          notify(select);
          changed();
          undo.push(entry);
          record({ ...base, status: 'filled', value: shown });
        }
        continue;
      }

      const hits = matchOptions(all, wanted[0] ?? '', field.driver, lookup);
      if (hits.length !== 1) {
        record({ ...base, status: 'invalid', value: toText(value) });
        continue;
      }
      const option = hits[0]!;
      const current = select.options[select.selectedIndex];
      if (current && current.value === option.value) {
        record({ ...base, status: 'unchanged', value: option.text.trim() });
        continue;
      }
      if (!isPlaceholder(current)) {
        record({ ...base, status: 'kept', value: current?.text.trim() ?? '' });
        continue;
      }
      setNativeValue(select, option.value);
      notify(select);
      changed();
      undo.push(entry);
      record({ ...base, status: 'filled', value: option.text.trim() });
      continue;
    }

    const text = toText(value);
    if (el.value === text) record({ ...base, status: 'unchanged', value: text });
    else if (el.value.trim() !== '') record({ ...base, status: 'kept', value: el.value });
    else {
      setNativeValue(el, text);
      notify(el);
      changed();
      undo.push(entry);
      record({ ...base, status: 'filled', value: text });
    }
  }

  return { results, undo };
}

/** Restores fields written by applyWrites. Pass keys to undo only some. Returns the keys restored. */
export function undoWrites(
  doc: Document,
  undo: UndoEntry[],
  keys?: string[],
  options: Pick<ApplyOptions, 'onChanged'> = {},
): string[] {
  const restored: string[] = [];
  // Reverse order: a field written later may depend on one written earlier.
  for (const entry of [...undo].reverse()) {
    if (keys && !keys.includes(entry.key)) continue;
    const el = resolve(doc, entry.selector);
    if (!el) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') {
      const box = el as HTMLInputElement;
      if (box.checked !== entry.previousChecked) box.click();
    } else if (tag === 'select' && entry.previousSelected) {
      for (const o of Array.from((el as HTMLSelectElement).options)) o.selected = entry.previousSelected.includes(o.value);
      notify(el);
    } else {
      setNativeValue(el, entry.previousValue);
      notify(el);
    }
    options.onChanged?.(entry.selector);
    restored.push(entry.key);
  }
  return restored.reverse();
}
