import { appendEntry, type ActivityEntry } from './activityLog';

// storage.local only: the log never syncs to another device or account.
const KEY = 'activityLog';

export async function loadEntries(): Promise<ActivityEntry[]> {
  const stored = await browser.storage.local.get(KEY);
  const value = stored[KEY];
  return Array.isArray(value) ? (value as ActivityEntry[]) : [];
}

export async function recordEntry(entry: Omit<ActivityEntry, 'id' | 'at'>): Promise<ActivityEntry[]> {
  const entries = appendEntry(await loadEntries(), {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  });
  await browser.storage.local.set({ [KEY]: entries });
  return entries;
}

export async function clearEntries(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
