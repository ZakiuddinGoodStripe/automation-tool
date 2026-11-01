import { setNativeValue } from './domEvents';

export interface SearchOptions {
  /** How long to wait for the search to return the wanted code. Default 6 s. */
  timeoutMs?: number;
  pollMs?: number;
}

export type SearchOutcome =
  | { status: 'filled' | 'unchanged' | 'kept'; text: string }
  | { status: 'invalid' | 'unsupported'; note: string };

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_POLL_MS = 50;
const NON_CODE = /[\s,;:()\-–—/]+/;

/** "E11.9", "e119" and "E 11.9" are the same ICD-10 code. */
export function normalizeCode(code: string): string {
  return code.replace(/[.\s]/g, '').toUpperCase();
}

/**
 * Whether the text carries the code as a whole token, wherever it sits:
 * "E11.9 - Type 2 diabetes ..." and "Type 2 diabetes ... (E11.9)" both match
 * "E11.9", while "E11.90" and "E11.311" do not. Exact codes only, never prefixes.
 */
export function textHasCode(text: string, code: string): boolean {
  const want = normalizeCode(code);
  if (!want) return false;
  return text.split(NON_CODE).some((token) => normalizeCode(token) === want);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fills a bootstrap-select whose options come from a live search (the EHR's
 * diagnosis boxes: "Min. 3 characters to search"). It does what a person
 * does: open the box, type the code, wait for the result, click it. Clicking
 * the result lets the widget and the page's own bindings do the rest, so no
 * widget internals are called. The code must match exactly one result.
 */
export async function fillSearchSelect(
  select: HTMLSelectElement,
  code: string,
  options: SearchOptions = {},
): Promise<SearchOutcome> {
  const wrapper = select.closest('.bootstrap-select');
  const toggle = wrapper?.querySelector<HTMLButtonElement>('button.dropdown-toggle');
  const search = wrapper?.querySelector<HTMLInputElement>('.bs-searchbox input');
  if (!wrapper || !toggle || !search) {
    return { status: 'unsupported', note: 'This field is not a search box we know how to drive.' };
  }

  const current = select.options[select.selectedIndex];
  if (current && current.value !== '' && current.value !== '0') {
    return { status: textHasCode(current.text, code) ? 'unchanged' : 'kept', text: current.text.trim() };
  }

  const view = select.ownerDocument.defaultView ?? window;
  const close = () => {
    if (wrapper.classList.contains('show')) toggle.click();
  };

  if (!wrapper.classList.contains('show')) toggle.click();
  setNativeValue(search, code);
  search.dispatchEvent(new view.Event('input', { bubbles: true }));
  search.dispatchEvent(new view.KeyboardEvent('keyup', { bubbles: true, key: code.slice(-1) }));

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const results = Array.from(wrapper.querySelectorAll<HTMLAnchorElement>('.inner li:not(.disabled) a[role="option"]'));
    const hits = results.filter((a) => textHasCode(a.textContent ?? '', code));
    if (hits.length === 1) {
      hits[0]!.click();
      break;
    }
    if (hits.length > 1) {
      close();
      return { status: 'invalid', note: `${code} matches ${hits.length} results, so none was chosen.` };
    }
    if (Date.now() >= deadline) {
      close();
      return { status: 'invalid', note: `No result for ${code} (${results.length} shown).` };
    }
    await sleep(pollMs);
  }

  // The click should leave the chosen result selected; check, rather than assume.
  const settle = Date.now() + 1000;
  while (select.value === '' && Date.now() < settle) await sleep(pollMs);
  close();
  const chosen = select.options[select.selectedIndex];
  if (!chosen || chosen.value === '' || !textHasCode(chosen.text, code)) {
    return { status: 'invalid', note: `The page did not accept ${code}.` };
  }
  return { status: 'filled', text: chosen.text.trim() };
}
