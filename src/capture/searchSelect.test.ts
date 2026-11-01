// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { fillSearchSelect, normalizeCode, textHasCode } from './searchSelect';
import { applyWrites, undoWrites } from './applyWrites';
import type { PlannedWrite } from './planWriteBack';
import { codeLast, installSearchSelect, searchSelectHtml, type CatalogEntry } from '../test/fakeSearchSelect';

const catalog: CatalogEntry[] = [
  { code: 'H40.1131', description: 'Primary open-angle glaucoma, bilateral, mild stage' },
  { code: 'H40.1132', description: 'Primary open-angle glaucoma, bilateral, moderate stage' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { code: 'E11.90', description: 'Synthetic sibling that starts with the same characters' },
  { code: 'Z99.9', description: 'Duplicate entry one' },
  { code: 'Z99.9', description: 'Duplicate entry two' },
];

function setup(opts: { delayMs?: number; format?: typeof codeLast } = {}) {
  const doc = new JSDOM(`<body>${searchSelectHtml('diagCodeA')}</body>`).window.document;
  installSearchSelect(doc, 'diagCodeA', catalog, opts);
  return { doc, select: doc.getElementById('diagCodeA') as HTMLSelectElement };
}

describe('textHasCode', () => {
  it('matches the whole code token in either layout, ignoring dots and case', () => {
    expect(textHasCode('E11.9 - Type 2 diabetes', 'E11.9')).toBe(true);
    expect(textHasCode('Type 2 diabetes mellitus (E11.9)', 'e119')).toBe(true);
    expect(textHasCode('E11.90 - sibling', 'E11.9')).toBe(false);
    expect(textHasCode('E11.311 - other', 'E11.9')).toBe(false);
    expect(textHasCode('anything', '')).toBe(false);
    expect(normalizeCode(' h40.1131 ')).toBe('H401131');
  });
});

describe('fillSearchSelect', () => {
  it('types the code, waits for the result and clicks exactly that one', async () => {
    const { select } = setup();
    let changes = 0;
    select.addEventListener('change', () => (changes += 1));
    const out = await fillSearchSelect(select, 'H40.1131');
    expect(out).toEqual({ status: 'filled', text: 'H40.1131 - Primary open-angle glaucoma, bilateral, mild stage' });
    expect(select.options[select.selectedIndex]!.text).toContain('H40.1131');
    expect(changes).toBe(1);
  });

  it('does not pick a longer code that shares the start', async () => {
    const { select } = setup();
    const out = await fillSearchSelect(select, 'E11.9');
    expect(out).toMatchObject({ status: 'filled' });
    expect(select.options[select.selectedIndex]!.text).toMatch(/^E11\.9 - Type 2/);
  });

  it('works when the result text puts the code last, and when the code is sent without its dot', async () => {
    const { select } = setup({ format: codeLast });
    const out = await fillSearchSelect(select, 'H401132');
    expect(out).toMatchObject({ status: 'filled', text: 'Primary open-angle glaucoma, bilateral, moderate stage (H40.1132)' });
  });

  it('refuses when no result matches, saying how many were shown', async () => {
    const { select } = setup();
    const out = await fillSearchSelect(select, 'H40.9999', { timeoutMs: 300 });
    expect(out.status).toBe('invalid');
    expect('note' in out && out.note).toMatch(/No result for H40\.9999/);
    expect(select.value).toBe('');
  });

  it('refuses when several results carry the same code', async () => {
    const { select } = setup();
    const out = await fillSearchSelect(select, 'Z99.9', { timeoutMs: 500 });
    expect(out).toMatchObject({ status: 'invalid' });
    expect('note' in out && out.note).toMatch(/matches 2 results/);
    expect(select.value).toBe('');
  });

  it('leaves an existing diagnosis alone', async () => {
    const { select } = setup();
    await fillSearchSelect(select, 'H40.1131');
    expect(await fillSearchSelect(select, 'H40.1131')).toMatchObject({ status: 'unchanged' });
    expect(await fillSearchSelect(select, 'E11.9')).toMatchObject({ status: 'kept' });
  });

  it('closes the menu afterwards, on success and failure', async () => {
    const { doc, select } = setup();
    await fillSearchSelect(select, 'E11.9');
    expect(doc.querySelector('.bootstrap-select')!.classList.contains('show')).toBe(false);
    const other = setup();
    await fillSearchSelect(other.select, 'Q00.0', { timeoutMs: 200 });
    expect(other.doc.querySelector('.bootstrap-select')!.classList.contains('show')).toBe(false);
  });

  it('reports a field that is not a search box as unsupported', async () => {
    const doc = new JSDOM('<select id="x"><option value="">-</option></select>').window.document;
    expect(await fillSearchSelect(doc.getElementById('x') as HTMLSelectElement, 'E11.9')).toMatchObject({ status: 'unsupported' });
  });
});

describe('search driver in the fill engine', () => {
  const write = (key: string, selector: string, value: PlannedWrite['value']): PlannedWrite => ({
    key,
    value,
    field: { key, label: key, selector, elementType: 'select', currentValue: '', driver: 'search' },
  });

  it('fills, reports the chosen text, and undoes back to empty', async () => {
    const { doc, select } = setup();
    const { results, undo } = await applyWrites(doc, [write('diagnosis.A', '#diagCodeA', 'H40.1131')]);
    expect(results[0]).toMatchObject({ status: 'filled', value: expect.stringContaining('H40.1131') });
    expect(undoWrites(doc, undo)).toEqual(['diagnosis.A']);
    expect(select.value).toBe('');
  });

  it('shows the reason on failure and refuses non-text values', async () => {
    const { doc } = setup();
    const { results } = await applyWrites(
      doc,
      [write('diagnosis.A', '#diagCodeA', ['E11.9']), write('diagnosis.A', '#diagCodeA', 'Q00.0')],
      { searchTimeoutMs: 200 },
    );
    expect(results[0]?.status).toBe('invalid');
    expect(results[1]).toMatchObject({ status: 'invalid', value: expect.stringMatching(/No result for Q00\.0/) });
  });
});
