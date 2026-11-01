// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { examFormConfig } from './examForm.config';
import { bindSpecs } from '../capture/bindFields';
import { buildRequest } from '../capture/buildRequest';
import { planWriteBack } from '../capture/planWriteBack';
import { applyWrites } from '../capture/applyWrites';
import { fetchValues, type FetchDeps } from '../api/fetchValues';
import { DEFAULT_SETTINGS } from '../settings/settings';
import type { CapturedSchema } from '../capture/types';
import { installSearchSelect, searchSelectHtml, type CatalogEntry } from '../test/fakeSearchSelect';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const catalog: CatalogEntry[] = [
  { code: 'H40.1131', description: 'Primary open-angle glaucoma, bilateral, mild stage' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
];

/**
 * A trimmed replica of the Eyefinity Edit Exam markup (ids, row hooks, classes and
 * option text copied from the real page): fixed rows keyed by data-row-type, each
 * with a procedure-code select, a price input and modifier selects that start disabled.
 */
function row(type: string, id: number, cptOptions: string, extra = '') {
  return `
  <tr data-row-type="${type}">
    <td><span>${type}</span></td>
    <td class="cptCodes"><select id="${type}_${id}"><option value="0">Select</option>${cptOptions}</select></td>
    <td><input type="text" id="price_${id}" disabled></td>
    <td class="diagCodes"><select multiple id="diag_${id}" disabled></select></td>
    <td class="modifierCodes">
      <select multiple id="modifier_${id}" disabled>
        <option value="21">21 - Prolonged eval mgmt</option>
        <option value="25">25 - Significant, separately identifiable EM service </option>
        <option value="RT">RT - Right Eye</option>
        <option value="LT">LT - Left Eye</option>
      </select>
      <select id="pqrs_modifier_${id}" disabled><option value="">Select</option><option value="1P">1P - Exclusion</option></select>
      ${extra}
    </td>
  </tr>`;
}

const page = `
  <select id="provider"><option value="0">Select</option><option value="8671">Dr. Priya Bhuta</option></select>
  ${LETTERS.map((l, i) => searchSelectHtml(`diagCode${l}`, i > 0)).join('')}
  <table><tbody>
    ${row('exam', 10, '<option value="197386">92002 - Intermediate Exam - New Pt</option><option value="197384">92004 - Comprehensive Exam - New</option>')}
    ${row('fitting', 20, '<option value="1625970">92310 - CL Fit New</option><option value="197376">92310.1 - CL Fit - Prev Pt</option><option value="1339907">92310-11 - 92310.11 - Cl Fit - Toric Or Specialty</option>')}
    ${row('procedure', 50, '<option value="1128595">92134 - Oct Posterior Retina</option><option value="2929963">0509T - PATTERN ELECTRORETINOGRAPHY</option>')}
    ${row('pqrs', 100, '<option value="388">0014F - Cataract Pre-Op Assess </option>')}
  </tbody></table>
  <select id="dilation"><option value="0">Select</option><option value="yes">Yes</option><option value="no">No (reason on file)</option></select>
  ${['PreDiabetes', 'Diabetes', 'DiabeticRetinopathy', 'HighCholesterol', 'Hypertension', 'AbnormalPupil', 'Arcus', 'Armd', 'Cataract', 'Glaucoma', 'Pcp']
    .map((n) => `<input type="checkbox" id="chk${n}">`)
    .join('')}
`;

// Demo mode never touches the network or the browser APIs.
const demoDeps: FetchDeps = {
  loadSettings: async () => DEFAULT_SETTINGS,
  hasPermission: async () => false,
  fetch: (() => {
    throw new Error('demo mode must not call the network');
  }) as unknown as typeof fetch,
};

const emptySchema: CapturedSchema = { formType: 'examForm', url: '', capturedAt: '', fields: [], skipped: 0 };

/**
 * "letter": the row diagnosis list reads "A - H40.1131 - ...". "icd": it shows only "H40.1131 - ...".
 * We have not seen the real list, so the driver must cope with both.
 */
type PointerFormat = 'letter' | 'icd';

function setup(pointerFormat: PointerFormat = 'letter') {
  const dom = new JSDOM(page, { url: 'https://pm.eyefinity.com/Patient/NewExam?id=3717251&examId=0' });
  const doc = dom.window.document;
  const model = new Set<string>();

  // Emulates the page: each diagnosis box is enabled only once the one before it holds a value.
  LETTERS.forEach((letter, i) => {
    installSearchSelect(doc, `diagCode${letter}`, catalog);
    const next = LETTERS[i + 1];
    // Emulates Knockout: each row's diagnosis list is rebuilt from the diagnoses entered so far.
    doc.getElementById(`diagCode${letter}`)!.addEventListener('change', () => {
      const chosen = LETTERS.map((l) => ({
        l,
        text: (doc.getElementById(`diagCode${l}`) as HTMLSelectElement).selectedOptions[0]?.text ?? '',
      })).filter((c) => c.text);
      doc.querySelectorAll('td.diagCodes select').forEach((sel) => {
        sel.innerHTML = chosen
          .map((c, n) => `<option value="${1000 + n}">${pointerFormat === 'letter' ? `${c.l} - ` : ''}${c.text}</option>`)
          .join('');
      });
    });
    if (!next) return;
    doc.getElementById(`diagCode${letter}`)!.addEventListener('change', () => {
      setTimeout(() => ((doc.getElementById(`diagCode${next}`) as HTMLSelectElement).disabled = false), 40);
    });
  });

  // Emulates the page: choosing a procedure code enables that row's dependent fields shortly after.
  doc.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (!target.closest('td.cptCodes') || target.value === '0') return;
    const tr = target.closest('tr')!;
    setTimeout(() => tr.querySelectorAll('td.modifierCodes select, td.diagCodes select').forEach((s) => ((s as HTMLSelectElement).disabled = false)), 60);
  });
  // Emulates Knockout's checked binding, which listens for click.
  doc.addEventListener('click', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type === 'checkbox') model[t.checked ? 'add' : 'delete'](t.id);
  });
  return { doc, model };
}

describe('exam form config against the real page structure', () => {
  it('binds every configured field by selector, each to exactly one element', () => {
    const { doc } = setup();
    const { bound, missing, ambiguous } = bindSpecs(doc, emptySchema, examFormConfig.fields);
    expect(missing).toEqual([]);
    expect(ambiguous).toEqual([]);
    expect(bound.size).toBe(examFormConfig.fields.length);
    // A row's procedure code is always requested before its modifiers.
    const keys = [...bound.keys()];
    for (const row of ['exam', 'fitting', 'procedure', 'pqrs']) {
      expect(keys.indexOf(`${row}.cpt`)).toBeLessThan(keys.indexOf(`${row}.modifiers`));
    }
    // Pointers come after the code (which enables the list) and before the modifiers; PQRS rows have none.
    for (const row of ['exam', 'fitting', 'procedure']) {
      expect(keys.indexOf(`${row}.cpt`)).toBeLessThan(keys.indexOf(`${row}.diagnoses`));
      expect(keys.indexOf(`${row}.diagnoses`)).toBeLessThan(keys.indexOf(`${row}.modifiers`));
    }
    expect(keys).not.toContain('pqrs.diagnoses');
    // Diagnoses are requested A..L in order, ahead of the procedure rows that point at them.
    expect(keys.slice(1, 13)).toEqual(LETTERS.map((l) => `diagnosis.${l}`));
    // Exam modifiers bind to the multi-select, not the hidden single pqrs_modifier_ select in the same cell.
    expect(bound.get('exam.modifiers')?.selector).toContain('select[id^="modifier_"]');
  });

  it.each<PointerFormat>(['letter', 'icd'])(
    'fills the demo patient end to end and leaves no-data fields alone (row list: %s)',
    async (format) => {
    const { doc, model } = setup(format);
    const { bound } = bindSpecs(doc, emptySchema, examFormConfig.fields);
    const request = buildRequest('cap-1', 'examForm', {}, bound.keys());
    const { response } = await fetchValues(request, demoDeps);
    const plan = planWriteBack(request, bound, response);

    const refreshed: string[] = [];
    const { results } = await applyWrites(doc, plan.writes, { waitEnabledMs: 1000, onChanged: (s) => refreshed.push(s) });
    const status = Object.fromEntries(results.map((r) => [r.key, r.status]));

    expect(status['provider']).toBe('filled');
    expect(status['diagnosis.A']).toBe('filled');
    expect(status['diagnosis.B']).toBe('filled'); // B was disabled until A was set
    const chosen = (id: string) => (doc.getElementById(id) as HTMLSelectElement).selectedOptions[0]?.text ?? '';
    expect(chosen('diagCodeA')).toContain('H40.1131');
    expect(chosen('diagCodeB')).toContain('E11.9');
    expect(chosen('diagCodeC')).toBe('');
    expect(status['exam.cpt']).toBe('filled');
    expect(status['exam.diagnoses']).toBe('filled');
    expect(status['procedure.diagnoses']).toBe('filled');
    expect(status['exam.modifiers']).toBe('filled');
    expect(status['fitting.cpt']).toBe('filled');
    expect(status['procedure.cpt']).toBe('filled');
    expect(status['procedure.modifiers']).toBe('filled');
    expect(status['dilationPerformed']).toBe('filled');

    const val = (sel: string) => (doc.querySelector(sel) as HTMLSelectElement).value;
    const pointed = (id: string) => Array.from((doc.getElementById(id) as HTMLSelectElement).selectedOptions).map((o) => o.text);
    expect(pointed('diag_10')).toHaveLength(2);
    expect(pointed('diag_10')[0]).toContain('H40.1131');
    expect(pointed('diag_10')[1]).toContain('E11.9');
    expect(pointed('diag_50')).toEqual([expect.stringContaining('H40.1131')]);
    expect(val('#provider')).toBe('8671');
    expect(val('#exam_10')).toBe('197384');
    expect(val('#fitting_20')).toBe('1625970'); // 92310, not 92310.1
    expect(val('#procedure_50')).toBe('1128595');
    expect(val('#dilation')).toBe('yes');
    expect(Array.from((doc.getElementById('modifier_10') as HTMLSelectElement).selectedOptions).map((o) => o.value)).toEqual(['25']);
    expect(Array.from((doc.getElementById('modifier_50') as HTMLSelectElement).selectedOptions).map((o) => o.value)).toEqual(['RT']);

    // Checkboxes went through click, so a click-bound model saw them; "No" values stayed unchecked.
    expect([...model].sort()).toEqual(['chkCataract', 'chkDiabetes', 'chkGlaucoma', 'chkHighCholesterol', 'chkHypertension']);

    // No data for these: fields stay blank.
    expect(plan.noData).toEqual(expect.arrayContaining(['diagnosis.C', 'diagnosis.L', 'fitting.diagnoses', 'fitting.modifiers', 'pqrs.cpt', 'pqrs.modifiers', 'diabeticRetinopathy', 'pcpForm']));
    expect(val('#pqrs_100')).toBe('0');
    // Widget redraw was requested for the selects we changed.
    expect(refreshed).toContain('#provider');
  },
  );

  it('reports diagnosis C as not ready when B was skipped, instead of guessing', async () => {
    const { doc } = setup();
    const { bound } = bindSpecs(doc, emptySchema, examFormConfig.fields);
    const request = buildRequest('cap-3', 'examForm', {}, bound.keys());
    const plan = planWriteBack(request, bound, { captureId: 'cap-3', values: { 'diagnosis.C': 'E11.9' } });
    const { results } = await applyWrites(doc, plan.writes, { waitEnabledMs: 150 });
    expect(results).toEqual([expect.objectContaining({ key: 'diagnosis.C', status: 'notReady' })]);
  });

  it('refuses a pointer to a diagnosis that was never entered', async () => {
    const { doc } = setup();
    const { bound } = bindSpecs(doc, emptySchema, examFormConfig.fields);
    const request = buildRequest('cap-4', 'examForm', {}, bound.keys());
    const plan = planWriteBack(request, bound, {
      captureId: 'cap-4',
      values: { 'diagnosis.A': 'H40.1131', 'exam.cpt': '92004', 'exam.diagnoses': ['A', 'C'] },
    });
    const { results } = await applyWrites(doc, plan.writes, { waitEnabledMs: 1000, optionsWaitMs: 150 });
    const status = Object.fromEntries(results.map((r) => [r.key, r.status]));
    expect(status['exam.diagnoses']).toBe('invalid');
    expect((doc.getElementById('diag_10') as HTMLSelectElement).selectedOptions).toHaveLength(0);
  });

  it('reports a modifier as not ready when its row has no procedure code', async () => {
    const { doc } = setup();
    const { bound } = bindSpecs(doc, emptySchema, examFormConfig.fields);
    const request = buildRequest('cap-2', 'examForm', {}, bound.keys());
    const plan = planWriteBack(request, bound, { captureId: 'cap-2', values: { 'exam.modifiers': ['25'] } });
    const { results } = await applyWrites(doc, plan.writes, { waitEnabledMs: 150 });
    expect(results).toEqual([expect.objectContaining({ key: 'exam.modifiers', status: 'notReady' })]);
  });
});
