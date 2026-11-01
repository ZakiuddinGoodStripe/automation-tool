import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ChartFill',
    // storage: local settings and activity log. sidePanel: the review panel that stays open beside the EHR.
    permissions: ['storage', 'sidePanel'],
    // The hospital system's host is unknown until it is configured, so access is requested at runtime for
    // that one host when the operator saves it in Settings, never granted up front.
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    action: { default_title: 'Open ChartFill' },
  },
});
