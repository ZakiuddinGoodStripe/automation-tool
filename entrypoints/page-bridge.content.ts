// Runs in the page's own JavaScript world, which the main content script cannot reach.
// The EHR wraps its <select>s in bootstrap-select; after we set the native <select> the wrapper
// still shows the old text until it is told to redraw, so the operator would see "Select" next
// to a value the page already holds. This only redraws; it never changes a value.
type SelectpickerJQuery = {
  (el: Element): { selectpicker(command: string): void };
  fn?: { selectpicker?: unknown };
};

export default defineContentScript({
  matches: ['https://pm.eyefinity.com/*'],
  world: 'MAIN',
  main() {
    document.addEventListener('chartfill:refresh', (event) => {
      const selector = (event as CustomEvent<unknown>).detail;
      if (typeof selector !== 'string') return;
      const jq = (window as unknown as { jQuery?: SelectpickerJQuery }).jQuery;
      if (!jq?.fn?.selectpicker) return;
      try {
        const el = document.querySelector(selector);
        if (el) jq(el).selectpicker('refresh');
      } catch {
        // Not a selectpicker, or the selector is no longer valid: nothing to redraw.
      }
    });
  },
});
