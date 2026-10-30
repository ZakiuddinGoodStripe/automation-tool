import type { FormConfig } from './types';

/**
 * Matches the current page against the registry. URL pattern is the
 * primary signal - EHR routes are usually form-specific. domSignature,
 * when present, must also be found in the DOM as a secondary
 * confirmation; omit it in a form's config when the route alone is
 * unambiguous.
 */
export function detectForm(
  registry: FormConfig[],
  url: string,
  doc: Pick<Document, 'querySelector'>,
): FormConfig | undefined {
  return registry.find((config) => {
    if (!new RegExp(config.match.urlPattern).test(url)) {
      return false;
    }
    if (config.match.domSignature && !doc.querySelector(config.match.domSignature)) {
      return false;
    }
    return true;
  });
}
