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
    if (spec.label === undefined) continue;
    const re = new RegExp(spec.label, 'i');
    const found = schema.fields.filter((f) => re.test(normalizeLabel(f.label)));
    matches.set(spec.key, found);
    for (const f of found) claimedBy.set(f, [...(claimedBy.get(f) ?? []), spec.key]);
  }

  const bound = new Map<string, CapturedField>();
  const missing: string[] = [];
  const ambiguous: string[] = [];

  for (const spec of specs) {
    if (spec.label === undefined) continue;
    const found = matches.get(spec.key) ?? [];
    if (found.length === 0) missing.push(spec.key);
    else if (found.length > 1 || (claimedBy.get(found[0]!)?.length ?? 0) > 1) ambiguous.push(spec.key);
    else bound.set(spec.key, found[0]!);
  }

  return { bound, missing, ambiguous };
}

function queryAll(doc: Pick<Document, 'querySelectorAll'>, selector: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function fieldFromElement(spec: FieldSpec, el: Element): CapturedField {
  const tag = el.tagName.toLowerCase();
  const field: CapturedField = {
    key: spec.key,
    label: spec.title ?? spec.key,
    selector: spec.selector!,
    elementType: tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'input',
    currentValue: (el as HTMLInputElement).value ?? '',
    driver: spec.driver,
    maxSelections: spec.maxSelections,
  };
  if (tag === 'input') field.inputType = (el as HTMLInputElement).type;
  return field;
}

/**
 * Binds every spec, by selector where given and by label otherwise. The
 * returned map keeps spec order, which matters: later fields (a row's
 * modifiers) are only fillable after earlier ones (its procedure code).
 */
export function bindSpecs(
  doc: Pick<Document, 'querySelectorAll'>,
  schema: CapturedSchema,
  specs: FieldSpec[],
): BindResult {
  const byLabel = bindFields(
    schema,
    specs.filter((s) => !s.selector),
  );

  const resolved = new Map<string, Element[]>();
  const claims = new Map<Element, number>();
  for (const spec of specs) {
    if (!spec.selector) continue;
    const found = queryAll(doc, spec.selector);
    resolved.set(spec.key, found);
    if (found.length === 1) claims.set(found[0]!, (claims.get(found[0]!) ?? 0) + 1);
  }

  const bound = new Map<string, CapturedField>();
  const missing: string[] = [];
  const ambiguous: string[] = [];

  for (const spec of specs) {
    if (spec.selector) {
      const found = resolved.get(spec.key) ?? [];
      if (found.length === 0) missing.push(spec.key);
      else if (found.length > 1 || (claims.get(found[0]!) ?? 0) > 1) ambiguous.push(spec.key);
      else bound.set(spec.key, fieldFromElement(spec, found[0]!));
    } else if (spec.label !== undefined) {
      const field = byLabel.bound.get(spec.key);
      if (field) bound.set(spec.key, field);
      else if (byLabel.missing.includes(spec.key)) missing.push(spec.key);
      else ambiguous.push(spec.key);
    }
  }

  return { bound, missing, ambiguous };
}
