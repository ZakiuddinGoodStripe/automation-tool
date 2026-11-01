/**
 * Audit trail of what the tool did. Deliberately holds no PHI: no field
 * values, no record ids, no labels. Only when, which form type, and counts.
 */
export interface ActivityEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  action: 'fill' | 'undo';
  formType: string;
  source: 'demo' | 'api';
  filled: number;
  kept: number;
  noData: number;
  needsAttention: number;
}

export const MAX_ENTRIES = 500;

/** Assumed manual typing time per field, used for the "time saved" estimate. Make configurable later. */
export const SECONDS_PER_FIELD = 15;

/** Newest first, capped so storage can't grow without bound. */
export function appendEntry(
  entries: ActivityEntry[],
  entry: ActivityEntry,
  max = MAX_ENTRIES,
): ActivityEntry[] {
  return [entry, ...entries].slice(0, max);
}

export interface ActivitySummary {
  fills: number;
  fieldsFilled: number;
  secondsSaved: number;
}

/** Undo entries subtract: a field the operator reverted didn't save any time. */
export function summarize(entries: ActivityEntry[]): ActivitySummary {
  let fills = 0;
  let fieldsFilled = 0;
  for (const e of entries) {
    if (e.action === 'fill') {
      fills += 1;
      fieldsFilled += e.filled;
    } else {
      fieldsFilled -= e.filled;
    }
  }
  fieldsFilled = Math.max(0, fieldsFilled);
  return { fills, fieldsFilled, secondsSaved: fieldsFilled * SECONDS_PER_FIELD };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const CSV_COLUMNS = ['at', 'action', 'formType', 'source', 'filled', 'kept', 'noData', 'needsAttention'] as const;

export function toCsv(entries: ActivityEntry[]): string {
  const rows = entries.map((e) => CSV_COLUMNS.map((c) => String(e[c])).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}
