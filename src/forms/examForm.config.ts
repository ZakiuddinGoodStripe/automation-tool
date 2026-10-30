import type { FormConfig } from './types';

/**
 * Target: Eyefinity Encompass "Edit Exam" page, e.g.
 * https://pm.eyefinity.com/Patient/NewExam?id=3717251&oid=0&examId=0&return=exam
 *
 * The route is specific enough to skip domSignature. Fields themselves
 * aren't hand-configured here - they're auto-discovered at runtime by
 * src/capture/captureSchema.ts, since this page's elements don't carry
 * stable, guessable ids.
 */
export const examFormConfig: FormConfig = {
  formType: 'examForm',
  match: {
    urlPattern: '/Patient/NewExam',
  },
};
