import { escapeCssIdentifier } from './escapeCssIdentifier';

/**
 * Best-effort human label for a form element: explicit <label for>, then
 * aria-label/aria-labelledby, then the nearest preceding text-bearing
 * sibling/ancestor-sibling (common in table/grid-based EHR forms where a
 * label isn't programmatically associated), then placeholder/name/id.
 */
export function resolveLabel(doc: Document, el: Element): string {
  if (el.id) {
    const labelled = doc.querySelector(`label[for="${escapeCssIdentifier(el.id)}"]`);
    if (labelled?.textContent?.trim()) {
      return labelled.textContent.trim();
    }
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) {
    return ariaLabel.trim();
  }

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }

  const closestLabel = el.closest('label');
  if (closestLabel?.textContent?.trim()) {
    return closestLabel.textContent.trim();
  }

  const nearbyText = findNearbyLabelText(el);
  if (nearbyText) return nearbyText;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim();

  const name = el.getAttribute('name');
  if (name?.trim()) return name.trim();

  if (el.id) return el.id;

  return 'Untitled field';
}

function findNearbyLabelText(el: Element): string | null {
  let prev = el.previousElementSibling;
  while (prev) {
    const text = prev.textContent?.trim();
    if (text && text.length < 80) return text;
    prev = prev.previousElementSibling;
  }

  const row = el.closest('tr, .form-group, .field, li');
  if (row) {
    const labelLike = row.querySelector('label, th, .label, .field-label');
    const text = labelLike?.textContent?.trim();
    if (text && text.length < 80) return text;
  }

  return null;
}
