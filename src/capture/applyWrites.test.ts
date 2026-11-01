// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyWrites, undoWrites } from './applyWrites';
import type { PlannedWrite } from './planWriteBack';
import type { CapturedField, FieldValue } from './types';

function docFromHtml(html: string): Document {
  return new JSDOM(html, { url: 'https://pm.eyefinity.com/Patient/NewExam?id=1' }).window.document;
}

function write(
  key: string,
  selector: string,
  value: FieldValue,
  extra: Partial<CapturedField> = {},
): PlannedWrite {
  return {
    key,
    value,
    field: { key, label: key, selector, elementType: 'input', currentValue: '', ...extra },
  };
}

const html = `
  <input id="name" value="">
  <input id="filled" value="Existing">
  <input id="box" type="checkbox">
  <input id="boxOn" type="checkbox" checked>
  <input id="radio" type="radio">
  <select id="sel"><option value="">Select</option><option value="1">Yes</option><option value="2">No</option></select>
  <select id="selSet"><option value="">Select</option><option value="1">Yes</option><option value="2">No</option></select>
  <select id="provider"><option value="0">Select</option><option value="8671">Dr. Priya Bhuta</option></select>
  <select id="cpt">
    <option value="0">Select</option>
    <option value="1">92310 - CL Fit New</option>
    <option value="2">92310.1 - CL Fit - Prev Pt</option>
    <option value="3">92310-11 - 92310.11 - Cl Fit - Toric</option>
    <option value="4">1100F - Patient screened</option>
    <option value="5">1100F - Patient screened</option>
    <option value="6">3215F </option>
  </select>
  <select id="mods" multiple>
    <option value="21">21 - Prolonged eval mgmt</option>
    <option value="25">25 - Significant, separately identifiable EM service </option>
    <option value="RT">RT - Right Eye</option>
    <option value="LT">LT - Left Eye</option>
  </select>
`;

describe('applyWrites', () => {
  it('fills empty text, checkbox and select fields and fires input/change', async () => {
    const doc = docFromHtml(html);
    const events: string[] = [];
    doc.getElementById('name')!.addEventListener('input', () => events.push('input'));
    doc.getElementById('name')!.addEventListener('change', () => events.push('change'));

    const { results } = await applyWrites(doc, [
      write('name', '#name', 'Dr. Bhuta'),
      write('box', '#box', 'Yes'),
      write('sel', '#sel', 'Yes', { elementType: 'select' }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['filled', 'filled', 'filled']);
    expect((doc.getElementById('name') as HTMLInputElement).value).toBe('Dr. Bhuta');
    expect((doc.getElementById('box') as HTMLInputElement).checked).toBe(true);
    expect((doc.getElementById('sel') as HTMLSelectElement).value).toBe('1');
    expect(events).toEqual(['input', 'change']);
  });

  it('clicks a checkbox so click-bound frameworks (Knockout) see the change', async () => {
    const doc = docFromHtml(html);
    let modelChecked = false;
    // Knockout's checked binding listens for click, not change.
    doc.getElementById('box')!.addEventListener('click', (e) => {
      modelChecked = (e.target as HTMLInputElement).checked;
    });
    await applyWrites(doc, [write('box', '#box', true)]);
    expect(modelChecked).toBe(true);
  });

  it('treats a "0" placeholder option as an empty select', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [write('provider', '#provider', 'Dr. Priya Bhuta', { elementType: 'select' })]);
    expect(results[0]).toMatchObject({ status: 'filled', value: 'Dr. Priya Bhuta' });
    expect((doc.getElementById('provider') as HTMLSelectElement).value).toBe('8671');
  });

  it('never overwrites an existing different value', async () => {
    const doc = docFromHtml(html);
    (doc.getElementById('selSet') as HTMLSelectElement).value = '2';
    const { results, undo } = await applyWrites(doc, [
      write('filled', '#filled', 'New'),
      write('boxOn', '#boxOn', 'No'),
      write('selSet', '#selSet', 'Yes', { elementType: 'select' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['kept', 'kept', 'kept']);
    expect((doc.getElementById('filled') as HTMLInputElement).value).toBe('Existing');
    expect((doc.getElementById('selSet') as HTMLSelectElement).value).toBe('2');
    expect(undo).toEqual([]);
  });

  it('reports unchanged, invalid, unsupported and notFound without writing', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [
      write('filled', '#filled', 'Existing'),
      write('sel', '#sel', 'Maybe', { elementType: 'select' }),
      write('radio', '#radio', 'x'),
      write('gone', '#gone', 'x'),
      write('badbox', '#box', 'perhaps'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['unchanged', 'invalid', 'unsupported', 'notFound', 'invalid']);
  });

  it('undoes only what was written, all or by key', async () => {
    const doc = docFromHtml(html);
    const { undo } = await applyWrites(doc, [
      write('name', '#name', 'Dr. Bhuta'),
      write('box', '#box', true),
      write('filled', '#filled', 'New'),
    ]);
    expect(undo.map((u) => u.key)).toEqual(['name', 'box']);

    expect(undoWrites(doc, undo, ['box'])).toEqual(['box']);
    expect((doc.getElementById('box') as HTMLInputElement).checked).toBe(false);
    expect((doc.getElementById('name') as HTMLInputElement).value).toBe('Dr. Bhuta');

    expect(undoWrites(doc, undo)).toEqual(['name', 'box']);
    expect((doc.getElementById('name') as HTMLInputElement).value).toBe('');
  });
});

describe('code driver', () => {
  const code = { elementType: 'select' as const, driver: 'code' as const };

  it('matches the leading code exactly, not a longer code that starts the same', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [write('cpt', '#cpt', '92310', code)]);
    expect(results[0]).toMatchObject({ status: 'filled', value: '92310 - CL Fit New' });
    expect((doc.getElementById('cpt') as HTMLSelectElement).value).toBe('1');
  });

  it('matches an option whose text is only the code', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [write('cpt', '#cpt', '3215F', code)]);
    expect(results[0]?.status).toBe('filled');
  });

  it('refuses a code that matches several options, and one that matches none', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [
      write('dup', '#cpt', '1100F', code),
      write('none', '#cpt', '99999', code),
    ]);
    expect(results.map((r) => r.status)).toEqual(['invalid', 'invalid']);
    expect((doc.getElementById('cpt') as HTMLSelectElement).value).toBe('0');
  });

  it('does not match on the internal option value', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [write('cpt', '#cpt', '4', code)]);
    expect(results[0]?.status).toBe('invalid');
  });
});

describe('multi-select', () => {
  const multi = { elementType: 'select' as const, driver: 'code' as const, maxSelections: 2 };

  it('selects several codes and reports them', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [write('mods', '#mods', ['25', 'RT'], multi)]);
    expect(results[0]).toMatchObject({ status: 'filled', value: '25, RT' });
    const selected = Array.from((doc.getElementById('mods') as HTMLSelectElement).selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['25', 'RT']);
  });

  it('refuses more codes than the field allows, and any unknown code, writing nothing', async () => {
    const doc = docFromHtml(html);
    const { results } = await applyWrites(doc, [
      write('tooMany', '#mods', ['21', '25', 'RT'], multi),
      write('unknown', '#mods', ['25', 'ZZ'], multi),
    ]);
    expect(results.map((r) => r.status)).toEqual(['invalid', 'invalid']);
    expect((doc.getElementById('mods') as HTMLSelectElement).selectedOptions).toHaveLength(0);
  });

  it('keeps an existing selection and undoes a fill', async () => {
    const doc = docFromHtml(html);
    const mods = doc.getElementById('mods') as HTMLSelectElement;
    const { undo, results } = await applyWrites(doc, [write('mods', '#mods', ['25'], multi)]);
    expect(results[0]?.status).toBe('filled');
    expect(undoWrites(doc, undo)).toEqual(['mods']);
    expect(mods.selectedOptions).toHaveLength(0);

    mods.options[0]!.selected = true;
    const again = await applyWrites(doc, [write('mods', '#mods', ['25'], multi)]);
    expect(again.results[0]).toMatchObject({ status: 'kept', value: '21' });
  });
});

describe('dependent fields', () => {
  it('waits for a disabled field the page enables after an earlier field', async () => {
    const doc = docFromHtml(html);
    const mods = doc.getElementById('mods') as HTMLSelectElement;
    mods.disabled = true;
    setTimeout(() => (mods.disabled = false), 120);
    const { results } = await applyWrites(doc, [write('mods', '#mods', ['25'], { elementType: 'select', driver: 'code' })], {
      waitEnabledMs: 1000,
    });
    expect(results[0]?.status).toBe('filled');
  });

  it('reports notReady when the field never enables', async () => {
    const doc = docFromHtml(html);
    (doc.getElementById('mods') as HTMLSelectElement).disabled = true;
    const { results } = await applyWrites(doc, [write('mods', '#mods', ['25'], { elementType: 'select', driver: 'code' })], {
      waitEnabledMs: 150,
    });
    expect(results[0]?.status).toBe('notReady');
  });

  it('tells the widget layer which selectors changed, on fill and undo', async () => {
    const doc = docFromHtml(html);
    const changed: string[] = [];
    const { undo } = await applyWrites(
      doc,
      [write('provider', '#provider', 'Dr. Priya Bhuta', { elementType: 'select' }), write('filled', '#filled', 'x')],
      { onChanged: (s) => changed.push(s) },
    );
    expect(changed).toEqual(['#provider']);
    undoWrites(doc, undo, undefined, { onChanged: (s) => changed.push(s) });
    expect(changed).toEqual(['#provider', '#provider']);
  });
});

describe('pointer driver', () => {
  const pointer = { elementType: 'select' as const, driver: 'pointer' as const, maxSelections: 4 };
  const rowHtml = (options: string) => `<select id="rowdiag" multiple>${options}</select>`;
  const letterOptions = `
    <option value="901">A - H40.1131 - Primary open-angle glaucoma</option>
    <option value="902">B - E11.9 - Type 2 diabetes</option>
    <option value="903">A1C - Hemoglobin test</option>`;

  it('selects the options led by each letter, and does not confuse "A" with "A1C"', async () => {
    const doc = docFromHtml(rowHtml(letterOptions));
    const { results } = await applyWrites(doc, [write('exam.diagnoses', '#rowdiag', ['A', 'b'], pointer)]);
    expect(results[0]).toMatchObject({ status: 'filled', value: 'A, B' });
    const selected = Array.from((doc.getElementById('rowdiag') as HTMLSelectElement).selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['901', '902']);
  });

  it('falls back to the ICD code behind the letter when the list shows only codes', async () => {
    const doc = docFromHtml(
      rowHtml('<option value="1">H40.1131 - Primary open-angle glaucoma</option><option value="2">E11.9 - Type 2 diabetes</option>'),
    );
    const { results } = await applyWrites(doc, [
      write('diagnosis.A', '#absent', 'H40.1131'),
      write('diagnosis.B', '#absent2', 'E11.9'),
      write('exam.diagnoses', '#rowdiag', ['B', 'A'], pointer),
    ]);
    expect(results.find((r) => r.key === 'exam.diagnoses')).toMatchObject({ status: 'filled', value: 'B, A' });
    const selected = Array.from((doc.getElementById('rowdiag') as HTMLSelectElement).selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['1', '2']);
  });

  it('refuses a letter that has no diagnosis behind it, after a short wait', async () => {
    const doc = docFromHtml(rowHtml(letterOptions));
    const started = Date.now();
    const { results } = await applyWrites(doc, [write('exam.diagnoses', '#rowdiag', ['A', 'C'], pointer)], { optionsWaitMs: 150 });
    expect(results[0]?.status).toBe('invalid');
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect((doc.getElementById('rowdiag') as HTMLSelectElement).selectedOptions).toHaveLength(0);
  });

  it('waits for options the page adds after the field was enabled', async () => {
    const doc = docFromHtml(rowHtml(''));
    const select = doc.getElementById('rowdiag') as HTMLSelectElement;
    setTimeout(() => {
      select.innerHTML = letterOptions;
    }, 150);
    const { results } = await applyWrites(doc, [write('exam.diagnoses', '#rowdiag', ['A'], pointer)], { optionsWaitMs: 1000 });
    expect(results[0]?.status).toBe('filled');
  });

  it('refuses an ambiguous letter at once instead of waiting', async () => {
    const doc = docFromHtml(rowHtml('<option value="1">A - first</option><option value="2">A - second</option>'));
    const started = Date.now();
    const { results } = await applyWrites(doc, [write('exam.diagnoses', '#rowdiag', ['A'], pointer)], { optionsWaitMs: 2000 });
    expect(results[0]?.status).toBe('invalid');
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('refuses more than four pointers and reports kept pointers as letters', async () => {
    const doc = docFromHtml(rowHtml(letterOptions));
    const tooMany = await applyWrites(doc, [write('x', '#rowdiag', ['A', 'B', 'C', 'D', 'E'], pointer)]);
    expect(tooMany.results[0]?.status).toBe('invalid');

    (doc.getElementById('rowdiag') as HTMLSelectElement).options[1]!.selected = true;
    const kept = await applyWrites(doc, [write('x', '#rowdiag', ['A'], pointer)]);
    expect(kept.results[0]).toMatchObject({ status: 'kept', value: 'B' });
  });
});

describe('progress reporting', () => {
  it('reports each field result as soon as it is known, in order', async () => {
    const doc = docFromHtml(html);
    const seen: string[] = [];
    const { results } = await applyWrites(
      doc,
      [write('name', '#name', 'Dr. Bhuta'), write('gone', '#gone', 'x'), write('box', '#box', true)],
      { onResult: (r) => seen.push(`${r.key}:${r.status}`) },
    );
    expect(seen).toEqual(['name:filled', 'gone:notFound', 'box:filled']);
    expect(results.map((r) => r.key)).toEqual(['name', 'gone', 'box']);
  });
});
