import type { CapturedField, CapturedFieldOption, CapturedSchema, CapturedElementType } from './types';
import { generateSelector } from './generateSelector';
import { resolveLabel } from './resolveLabel';
import { slugify, uniqueKey } from './slugify';

const SKIPPED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file']);

type FormElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Checked by tagName rather than `instanceof` so this works regardless of
// which window/realm the element came from (relevant for test doubles,
// and for any EHR page that embeds the form in an iframe).
function isCapturable(el: Element): el is FormElement {
  switch (el.tagName) {
    case 'SELECT':
    case 'TEXTAREA':
      return true;
    case 'INPUT':
      return !SKIPPED_INPUT_TYPES.has((el as HTMLInputElement).type);
    default:
      return false;
  }
}

function isFillable(el: FormElement): boolean {
  const input = el as HTMLInputElement;
  return !input.disabled && !input.readOnly && input.type !== 'password';
}

function resolvesUniquely(doc: Document, selector: string, el: Element): boolean {
  try {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null;
}

function elementType(el: FormElement): CapturedElementType {
  if (el.tagName === 'SELECT') return 'select';
  if (el.tagName === 'TEXTAREA') return 'textarea';
  return 'input';
}

/**
 * Scans the live page for fillable form fields and builds a JSON
 * description of them: label, a selector that resolves back to the exact
 * element, type, and current value. This is what gets sent to the API
 * ("give me data shaped like this") instead of relying on hand-written,
 * guessable selectors per form.
 */
export function captureSchema(
  doc: Document,
  formType: string | null,
  options: { scope?: string } = {},
): CapturedSchema {
  const root: ParentNode = (options.scope && doc.querySelector(options.scope)) || doc;
  const candidates = Array.from(root.querySelectorAll('input, select, textarea')).filter(
    (el): el is FormElement =>
      isCapturable(el) && isVisible(el as HTMLElement) && isFillable(el as FormElement),
  );

  const usedKeys = new Set<string>();
  let skipped = 0;
  const fields: CapturedField[] = [];

  for (const el of candidates) {
    const selector = generateSelector(doc, el);
    // A selector that doesn't resolve to exactly this element would fill the wrong field later.
    if (!resolvesUniquely(doc, selector, el)) {
      skipped += 1;
      continue;
    }
    const label = resolveLabel(doc, el);
    const key = uniqueKey(slugify(label), usedKeys);
    const field: CapturedField = {
      key,
      label,
      selector,
      elementType: elementType(el),
      currentValue: (el as HTMLInputElement | HTMLTextAreaElement).value ?? '',
    };

    if (el.tagName === 'INPUT') {
      field.inputType = (el as HTMLInputElement).type;
    }

    if (el.tagName === 'SELECT') {
      const options: CapturedFieldOption[] = Array.from((el as HTMLSelectElement).options).map(
        (option) => ({ value: option.value, text: option.text }),
      );
      field.options = options;
    }

    fields.push(field);
  }

  return {
    formType,
    url: doc.location?.href ?? '',
    capturedAt: new Date().toISOString(),
    fields,
    skipped,
  };
}
