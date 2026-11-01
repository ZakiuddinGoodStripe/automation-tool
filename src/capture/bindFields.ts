import type { FieldSpec } from '../forms/types';
import type { CapturedField, CapturedSchema } from './types';

export interface BindResult {
  /** key -> the single captured field it resolved to. Held locally for write-back. */
  bound: Map<string, CapturedField>;
  /** Keys whose label matched no field on this page. */
  missing: string[];
  /** Keys that matched several fields, or a field another key also claimed. Never bound: writing would be a guess. */
  ambiguous: string[];
}

/** Strips required-markers, colons, question marks and extra whitespace so "* Provider:" matches ^provider$. */
export function normalizeLabel(label: string): string {
  return label
    .replace(/[*:?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function bindFields(schema: CapturedSchema, specs: FieldSpec[]): BindResult {
  const matches = new Map<string, CapturedField[]>();
  const claimedBy = new Map<CapturedField, string[]>();

  for (const spec of specs) {
    const re = new RegExp(spec.label, 'i');
    const found = schema.fields.filter((f) => re.test(normalizeLabel(f.label)));
    matches.set(spec.key, found);
    for (const f of found) claimedBy.set(f, [...(claimedBy.get(f) ?? []), spec.key]);
  }

  const bound = new Map<string, CapturedField>();
  const missing: string[] = [];
  const ambiguous: string[] = [];

  for (const spec of specs) {
    const found = matches.get(spec.key) ?? [];
    if (found.length === 0) missing.push(spec.key);
    else if (found.length > 1 || (claimedBy.get(found[0]!)?.length ?? 0) > 1) ambiguous.push(spec.key);
    else bound.set(spec.key, found[0]!);
  }

  return { bound, missing, ambiguous };
}
