import { describe, expect, it } from 'vitest';
import { bindFields, normalizeLabel } from './bindFields';
import { buildRequest, extractContext } from './buildRequest';
import { planWriteBack } from './planWriteBack';
import type { CapturedField, CapturedSchema } from './types';

function field(key: string, label: string): CapturedField {
  return { key, label, selector: `#${key}`, elementType: 'input', currentValue: '' };
}

const schema: CapturedSchema = {
  formType: 'examForm',
  url: 'https://pm.eyefinity.com/Patient/NewExam?id=3717251&examId=0',
  capturedAt: '2026-01-01T00:00:00Z',
  skipped: 0,
  fields: [
    field('f1', '* Provider'),
    field('f2', 'Diabetes'),
    field('f3', 'Pre-Diabetes'),
    field('f4', 'Notes'),
    field('f5', 'Notes'),
  ],
};

describe('bindFields', () => {
  it('normalizes markers and binds anchored labels to exactly one field', () => {
    expect(normalizeLabel('* Provider:')).toBe('Provider');
    const { bound, missing, ambiguous } = bindFields(schema, [
      { key: 'provider', label: '^provider$' },
      { key: 'diabetes', label: '^diabetes$' },
      { key: 'glaucoma', label: '^glaucoma$' },
      { key: 'notes', label: '^notes$' },
    ]);
    expect(bound.get('provider')?.selector).toBe('#f1');
    expect(bound.get('diabetes')?.selector).toBe('#f2'); // not Pre-Diabetes
    expect(missing).toEqual(['glaucoma']);
    expect(ambiguous).toEqual(['notes']);
    expect(bound.has('notes')).toBe(false);
  });

  it('refuses to bind two keys to the same field', () => {
    const { bound, ambiguous } = bindFields(schema, [
      { key: 'a', label: '^provider$' },
      { key: 'b', label: 'provider' },
    ]);
    expect(bound.size).toBe(0);
    expect(ambiguous).toEqual(['a', 'b']);
  });
});

describe('request', () => {
  it('contains only keys and record ids', () => {
    const context = extractContext(schema.url, { patientId: 'id', examId: 'examId', nope: 'missing' });
    expect(context).toEqual({ patientId: '3717251', examId: '0' });
    const req = buildRequest('cap-1', 'examForm', context, ['provider', 'diabetes']);
    expect(req).toEqual({
      captureId: 'cap-1',
      formType: 'examForm',
      context,
      keys: ['provider', 'diabetes'],
    });
  });
});

describe('planWriteBack', () => {
  const { bound } = bindFields(schema, [
    { key: 'provider', label: '^provider$' },
    { key: 'diabetes', label: '^diabetes$' },
  ]);
  const request = buildRequest('cap-1', 'examForm', {}, bound.keys());

  it('writes only requested+bound keys and reports the rest', () => {
    const plan = planWriteBack(request, bound, {
      captureId: 'cap-1',
      values: { provider: 'Dr. Priya Bhuta', rogue: 'x' },
    });
    expect(plan.writes.map((w) => [w.key, w.field.selector, w.value])).toEqual([
      ['provider', '#f1', 'Dr. Priya Bhuta'],
    ]);
    expect(plan.noData).toEqual(['diabetes']);
    expect(plan.unexpected).toEqual(['rogue']);
  });

  it('treats null as no data and rejects a response for another capture', () => {
    expect(planWriteBack(request, bound, { captureId: 'cap-1', values: { provider: null } }).writes).toEqual([]);
    const stale = planWriteBack(request, bound, { captureId: 'old', values: { provider: 'x' } });
    expect(stale.error).toBeDefined();
    expect(stale.writes).toEqual([]);
  });
});
