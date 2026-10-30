export interface FormMatch {
  /** Regex source tested against the page URL. Primary signal - most EHR routes are form-specific. */
  urlPattern: string;
  /**
   * Optional CSS selector that must also exist on the page to confirm the
   * match. Use this when a URL pattern alone could be ambiguous; omit it
   * when the route already uniquely identifies the form.
   */
  domSignature?: string;
}

export interface FormConfig {
  /** Unique identifier for this form type, e.g. "examForm". Tags the captured schema sent to the API. */
  formType: string;
  match: FormMatch;
}
