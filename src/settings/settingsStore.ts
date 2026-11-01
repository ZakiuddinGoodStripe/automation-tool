import { normalizeSettings, type Settings } from './settings';

// storage.local only: settings, and above all the API key, never sync to another device or account.
const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(KEY);
  return normalizeSettings(stored[KEY]);
}

/** Merges a patch into the saved settings. Pass apiKey '' to remove the key; omit it to keep the saved one. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await browser.storage.local.set({ [KEY]: next });
  return next;
}
