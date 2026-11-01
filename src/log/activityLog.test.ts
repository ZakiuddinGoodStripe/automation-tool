import { describe, expect, it } from 'vitest';
import { appendEntry, formatDuration, summarize, toCsv, SECONDS_PER_FIELD, type ActivityEntry } from './activityLog';

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'x',
    at: '2026-11-02T10:00:00.000Z',
    action: 'fill',
    formType: 'examForm',
    source: 'demo',
    filled: 8,
    kept: 1,
    noData: 2,
    needsAttention: 0,
    ...over,
  };
}

describe('activity log', () => {
  it('prepends newest first and caps the length', () => {
    const list = appendEntry([entry({ id: 'a' }), entry({ id: 'b' })], entry({ id: 'c' }), 2);
    expect(list.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('summarizes time saved and subtracts undone fields', () => {
    const s = summarize([entry({ filled: 8 }), entry({ filled: 4 }), entry({ action: 'undo', filled: 2 })]);
    expect(s).toEqual({ fills: 2, fieldsFilled: 10, secondsSaved: 10 * SECONDS_PER_FIELD });
    expect(summarize([entry({ action: 'undo', filled: 5 })]).fieldsFilled).toBe(0);
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(4500)).toBe('1 h 15 min');
  });

  it('exports csv with only non-PHI columns', () => {
    const csv = toCsv([entry()]);
    expect(csv.split('\n')[0]).toBe('at,action,formType,source,filled,kept,noData,needsAttention');
    expect(csv.split('\n')[1]).toBe('2026-11-02T10:00:00.000Z,fill,examForm,demo,8,1,2,0');
  });
});
