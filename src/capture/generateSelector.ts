import { escapeCssIdentifier } from './escapeCssIdentifier';

/**
 * Builds a CSS selector that resolves back to this exact element. Prefers
 * a unique id; otherwise walks up a few ancestors building a
 * tag(:nth-of-type) path, which is resilient enough for forms whose ids
 * are generated/unstable but whose structure is consistent.
 */
export function generateSelector(doc: Document, el: Element): string {
  if (el.id && doc.querySelectorAll(`#${escapeCssIdentifier(el.id)}`).length === 1) {
    return `#${escapeCssIdentifier(el.id)}`;
  }

  const parts: string[] = [];
  let node: Element | null = el;

  while (node && node.nodeType === 1 && parts.length < 6) {
    if (node.id && doc.querySelectorAll(`#${escapeCssIdentifier(node.id)}`).length === 1) {
      parts.unshift(`#${escapeCssIdentifier(node.id)}`);
      break;
    }

    let segment = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblingsOfSameTag = Array.from(parent.children).filter(
        (child) => child.tagName === node!.tagName,
      );
      if (siblingsOfSameTag.length > 1) {
        segment += `:nth-of-type(${siblingsOfSameTag.indexOf(node) + 1})`;
      }
    }

    parts.unshift(segment);
    node = parent;
  }

  return parts.join(' > ');
}
