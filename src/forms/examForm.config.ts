import type { FormConfig } from './types';

/**
 * Target: Eyefinity Encompass "Edit Exam" page, e.g.
 * https://pm.eyefinity.com/Patient/NewExam?id=3717251&oid=0&examId=0&return=exam
 *
 * `fields` is the contract with the DB: each key is a fixed name, bound to
 * the page field whose label matches. Selectors are still discovered at
 * runtime (see src/capture), never hand-written.
 *
 * Not yet covered: the Procedure Codes table (needs row/column-aware
 * binding) and the A-D diagnosis dropdown labels beyond "A".
 */
export const examFormConfig: FormConfig = {
  formType: 'examForm',
  match: {
    urlPattern: '/Patient/NewExam',
  },
  context: { patientId: 'id', examId: 'examId' },
  fields: [
    { key: 'provider', label: '^provider$' },
    { key: 'diagnosisA', label: '^a$' },
    { key: 'dilationPerformed', label: '^dilation performed$' },
    { key: 'preDiabetes', label: '^pre-diabetes$' },
    { key: 'diabetes', label: '^diabetes$' },
    { key: 'diabeticRetinopathy', label: '^diabetic retinopathy$' },
    { key: 'highCholesterol', label: '^high cholesterol$' },
    { key: 'hypertension', label: '^hypertension$' },
    { key: 'abnormalPupil', label: '^abnormal pupil$' },
    { key: 'arcus', label: '^arcus$' },
    { key: 'armd', label: '^armd$' },
    { key: 'cataract', label: '^cataract$' },
    { key: 'glaucoma', label: '^glaucoma$' },
    { key: 'pcpForm', label: '^pcp form$' },
  ],
};
