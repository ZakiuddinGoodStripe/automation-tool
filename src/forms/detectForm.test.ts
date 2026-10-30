import { describe, expect, it } from 'vitest';
import { detectForm } from './detectForm';
import type { FormConfig } from './types';

function fakeDoc(existingSelectors: string[]): Pick<Document, 'querySelector'> {
  return {
    querySelector: (selector: string) => (existingSelectors.includes(selector) ? ({} as Element) : null),
  };
}

describe('detectForm', () => {
  it('matches on URL pattern alone when domSignature is omitted', () => {
    const configs: FormConfig[] = [
      { formType: 'examForm', match: { urlPattern: '/Patient/NewExam' } },
    ];
    const match = detectForm(
      configs,
      'https://pm.eyefinity.com/Patient/NewExam?id=123&examId=0',
      fakeDoc([]),
    );
    expect(match?.formType).toBe('examForm');
  });

  it('requires domSignature to also be present when the config specifies one', () => {
    const configs: FormConfig[] = [
      {
        formType: 'examForm',
        match: { urlPattern: '/Patient/NewExam', domSignature: '#exam-form' },
      },
    ];
    const noMatch = detectForm(
      configs,
      'https://pm.eyefinity.com/Patient/NewExam?id=123',
      fakeDoc([]),
    );
    expect(noMatch).toBeUndefined();

    const match = detectForm(
      configs,
      'https://pm.eyefinity.com/Patient/NewExam?id=123',
      fakeDoc(['#exam-form']),
    );
    expect(match?.formType).toBe('examForm');
  });

  it('returns undefined when no config matches the URL', () => {
    const configs: FormConfig[] = [
      { formType: 'examForm', match: { urlPattern: '/Patient/NewExam' } },
    ];
    const match = detectForm(configs, 'https://pm.eyefinity.com/Patient/Demographics', fakeDoc([]));
    expect(match).toBeUndefined();
  });
});
