/** Frameworks track values through the native setter; assigning .value directly can be ignored by them. */
export function setNativeValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/** Fires the events a user's edit would, so framework bindings pick the change up. */
export function notify(el: Element): void {
  const view = el.ownerDocument.defaultView ?? window;
  el.dispatchEvent(new view.Event('input', { bubbles: true }));
  el.dispatchEvent(new view.Event('change', { bubbles: true }));
}
