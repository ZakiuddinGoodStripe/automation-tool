import type { FieldSpec, FormConfig } from './types';

/**
 * Target: Eyefinity Encompass "Edit Exam" page, e.g.
 * https://pm.eyefinity.com/Patient/NewExam?id=3717251&oid=0&examId=0&return=exam
 *
 * `fields` is the contract with the DB: each key is a fixed name, bound to a
 * page field. This page has stable ids and row hooks (`tr[data-row-type]`), so
 * fields are bound by selector, which also reaches fields capture skips (the
 * row dependents start disabled). Order matters: a row's modifiers are only
 * enabled by the page once its procedure code is set, so code comes first.
 *
 * Diagnosis codes A-L are live-search boxes (min. 3 characters), filled by typing the ICD-10 code and
 * clicking the result. The page reveals each box only after the one before it is set, so the keys are
 * ordered A..L and must be sent without gaps. The letters double as the pointers procedure rows use.
 *
 * Row diagnosis pointers (`exam.diagnoses: ["A","B"]`) are the letters of those diagnoses, up to 4 per row.
 *
 * Not yet covered:
 * - Extra Procedure/PQRS rows added with the "+ Procedure" / "+ PQRS" buttons.
 */
const rowFields = (
  row: string,
  title: string,
  modifiersSelector: string,
  options: { modifiersMax?: number; pointers?: boolean } = {},
): FieldSpec[] => [
  {
    key: `${row}.cpt`,
    title: `${title}: procedure code`,
    selector: `tr[data-row-type="${row}"] td.cptCodes select`,
    driver: 'code',
  },
  // Which of the diagnoses A-L this row points at. The page enables the list after the code is set and
  // builds it from the diagnoses entered above, so it comes after both. PQRS rows have no such list.
  ...(options.pointers === false
    ? []
    : [
        {
          key: `${row}.diagnoses`,
          title: `${title}: diagnoses`,
          selector: `tr[data-row-type="${row}"] td.diagCodes select[id^="diag_"]`,
          driver: 'pointer',
          maxSelections: 4,
        } satisfies FieldSpec,
      ]),
  {
    key: `${row}.modifiers`,
    title: `${title}: modifiers`,
    selector: `tr[data-row-type="${row}"] td.modifierCodes ${modifiersSelector}`,
    driver: 'code',
    maxSelections: options.modifiersMax,
  },
];

const DIAGNOSIS_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

const diagnosisFields: FieldSpec[] = DIAGNOSIS_LETTERS.map((letter) => ({
  key: `diagnosis.${letter}`,
  title: `Diagnosis ${letter}`,
  selector: `#diagCode${letter}`,
  driver: 'search',
}));

export const examFormConfig: FormConfig = {
  formType: 'examForm',
  match: {
    urlPattern: '/Patient/NewExam',
  },
  context: { patientId: 'id', examId: 'examId' },
  fields: [
    { key: 'provider', title: 'Provider', selector: '#provider' },
    ...diagnosisFields,
    ...rowFields('exam', 'Exam', 'select[id^="modifier_"]', { modifiersMax: 4 }),
    ...rowFields('fitting', 'Fitting Fee', 'select[id^="modifier_"]', { modifiersMax: 4 }),
    ...rowFields('procedure', 'Procedure', 'select[id^="modifier_"]', { modifiersMax: 4 }),
    ...rowFields('pqrs', 'PQRS', 'select[id^="pqrs_modifier_"]', { pointers: false }),
    { key: 'dilationPerformed', title: 'Dilation performed', selector: '#dilation' },
    { key: 'preDiabetes', title: 'Pre-Diabetes', selector: '#chkPreDiabetes' },
    { key: 'diabetes', title: 'Diabetes', selector: '#chkDiabetes' },
    { key: 'diabeticRetinopathy', title: 'Diabetic Retinopathy', selector: '#chkDiabeticRetinopathy' },
    { key: 'highCholesterol', title: 'High Cholesterol', selector: '#chkHighCholesterol' },
    { key: 'hypertension', title: 'Hypertension', selector: '#chkHypertension' },
    { key: 'abnormalPupil', title: 'Abnormal Pupil', selector: '#chkAbnormalPupil' },
    { key: 'arcus', title: 'ARCUS', selector: '#chkArcus' },
    { key: 'armd', title: 'ARMD', selector: '#chkArmd' },
    { key: 'cataract', title: 'Cataract', selector: '#chkCataract' },
    { key: 'glaucoma', title: 'Glaucoma', selector: '#chkGlaucoma' },
    { key: 'pcpForm', title: 'PCP Form', selector: '#chkPcp' },
  ],
};
