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
export function captureSchema(doc: Document, formType: string | null): CapturedSchema {
  const candidates = Array.from(doc.querySelectorAll('input, select, textarea')).filter(
    (el): el is FormElement => isCapturable(el) && isVisible(el as HTMLElement),
  );

  const usedKeys = new Set<string>();

  const fields: CapturedField[] = candidates.map((el) => {
    const label = resolveLabel(doc, el);
    const key = uniqueKey(slugify(label), usedKeys);
    const field: CapturedField = {
      key,
      label,
      selector: generateSelector(doc, el),
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

    return field;
  });

  return {
    formType,
    url: doc.location?.href ?? '',
    capturedAt: new Date().toISOString(),
    fields,
  };
}
