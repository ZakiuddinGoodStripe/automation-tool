/**
 * A stand-in for the EHR's live-search dropdown (bootstrap-select with an AJAX search box), built from the
 * real page's markup: a wrapper holding the native <select>, a toggle button, a search input, a results list
 * of `li > a[role=option]`, and a status line. Behaviour is simulated: results appear after a delay once 3+
 * characters are typed, and clicking a result selects it and closes the menu. Test-only: it proves our
 * driver's logic, not the real widget's behaviour.
 */
export interface CatalogEntry {
  code: string;
  description: string;
}

export type ResultFormat = (entry: CatalogEntry) => string;

export const codeFirst: ResultFormat = (e) => `${e.code} - ${e.description}`;
export const codeLast: ResultFormat = (e) => `${e.description} (${e.code})`;

export function searchSelectHtml(id: string, disabled = false): string {
  return `<div class="dropdown bootstrap-select form-control"><select id="${id}"${disabled ? ' disabled' : ''}><option class="bs-title-option" value=""></option></select><button type="button" class="btn dropdown-toggle" data-id="${id}"></button><div class="dropdown-menu"><div class="bs-searchbox"><input type="search" class="form-control"></div><div class="inner show" role="listbox"><ul class="dropdown-menu inner show"></ul></div><div class="status">Min. 3 characters to search (ICD-10 code or description)</div></div></div>`;
}

const norm = (s: string) => s.replace(/[.\s]/g, '').toUpperCase();

export function installSearchSelect(
  doc: Document,
  id: string,
  catalog: CatalogEntry[],
  options: { delayMs?: number; format?: ResultFormat } = {},
): void {
  const select = doc.getElementById(id) as HTMLSelectElement;
  const wrapper = select.closest('.bootstrap-select') as HTMLElement;
  const toggle = wrapper.querySelector('button.dropdown-toggle') as HTMLButtonElement;
  const input = wrapper.querySelector('.bs-searchbox input') as HTMLInputElement;
  const list = wrapper.querySelector('ul') as HTMLUListElement;
  const format = options.format ?? codeFirst;
  const delay = options.delayMs ?? 60;
  let serial = 0;

  toggle.addEventListener('click', () => wrapper.classList.toggle('show'));

  input.addEventListener('keyup', () => {
    const query = input.value;
    const mine = ++serial;
    if (query.trim().length < 3) {
      list.innerHTML = '';
      return;
    }
    setTimeout(() => {
      if (mine !== serial) return; // a newer search replaced this one
      const q = norm(query);
      const hits = catalog.filter((e) => norm(e.code).startsWith(q) || e.description.toUpperCase().includes(query.toUpperCase()));
      list.innerHTML = '';
      for (const entry of hits) {
        const li = doc.createElement('li');
        const a = doc.createElement('a');
        a.setAttribute('role', 'option');
        a.className = 'dropdown-item';
        a.innerHTML = `<span class="text"></span>`;
        a.querySelector('.text')!.textContent = format(entry);
        a.addEventListener('click', () => {
          const option = doc.createElement('option');
          option.value = `${entry.code}#${select.options.length}`;
          option.textContent = format(entry);
          select.appendChild(option);
          select.value = option.value;
          select.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event('change', { bubbles: true }));
          wrapper.classList.remove('show');
        });
        li.appendChild(a);
        list.appendChild(li);
      }
    }, delay);
  });
}
