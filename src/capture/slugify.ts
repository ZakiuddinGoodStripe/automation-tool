export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'field';
}

/** Appends -2, -3, ... to duplicate keys so every field key in a schema is unique. */
export function uniqueKey(base: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }
  let i = 2;
  while (usedKeys.has(`${base}-${i}`)) i += 1;
  const key = `${base}-${i}`;
  usedKeys.add(key);
  return key;
}
