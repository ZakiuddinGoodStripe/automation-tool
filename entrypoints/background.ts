import { fetchValues, testConnection, type FetchDeps } from '../src/api/fetchValues';
import { loadSettings } from '../src/settings/settingsStore';
import {
  isFetchValuesRequest,
  isTestConnectionRequest,
  type FetchValuesResponse,
  type TestConnectionResponse,
} from '../src/messages';

const deps: FetchDeps = {
  loadSettings,
  hasPermission: (originPattern) => browser.permissions.contains({ origins: [originPattern] }),
  fetch: (input, init) => fetch(input, init),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// This is the only place that holds the API key and the only place that calls the hospital system.
export default defineBackground(() => {
  // Content scripts run inside the EHR page and can read storage.local by default.
  // Restrict it to extension pages so the API key is out of the page's reach.
  (browser.storage.local as unknown as { setAccessLevel?(o: { accessLevel: string }): Promise<void> })
    .setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch(() => undefined);

  // Clicking the toolbar icon opens the side panel, which stays open while the operator works the page.
  // Chrome only: Firefox uses sidebar_action, which WXT wires from the sidepanel entrypoint.
  (browser as unknown as { sidePanel?: { setPanelBehavior(o: { openPanelOnActionClick: boolean }): Promise<void> } })
    .sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isFetchValuesRequest(message)) {
      (async (): Promise<FetchValuesResponse> => {
        try {
          return { ok: true, result: await fetchValues(message.request, deps) };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      })().then(sendResponse);
      return true; // keep the message channel open for the async response
    }

    if (isTestConnectionRequest(message)) {
      (async (): Promise<TestConnectionResponse> => {
        try {
          return { ok: true, ...(await testConnection(deps)) };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      })().then(sendResponse);
      return true;
    }

    return undefined;
  });
});
