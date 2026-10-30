/**
 * CSS.escape isn't guaranteed to be present in every environment this
 * module runs in (test runners without a full browser global). Falls
 * back to a minimal manual escape when it's missing.
 */
export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
