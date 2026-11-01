import { useState } from 'react';
import type { TestConnectionResponse } from '@/src/messages';
import { toPublic, validateEndpoint, type Mode, type PublicSettings } from '@/src/settings/settings';
import { saveSettings } from '@/src/settings/settingsStore';

type Notice = { kind: 'ok' | 'bad'; text: string } | null;

interface Props {
  settings: PublicSettings;
  onSaved(next: PublicSettings): void;
}

function SettingsView({ settings, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>(settings.mode);
  const [url, setUrl] = useState(settings.endpointUrl);
  // The saved key is never read back into the UI. Typing here replaces it.
  const [newKey, setNewKey] = useState('');
  const [preview, setPreview] = useState(settings.previewBeforeSend);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    mode !== settings.mode || url !== settings.endpointUrl || newKey !== '' || preview !== settings.previewBeforeSend;

  async function save() {
    setNotice(null);
    setBusy(true);
    try {
      let savedUrl = url.trim();
      if (mode === 'live') {
        const check = validateEndpoint(url);
        if (!check.ok) return setNotice({ kind: 'bad', text: check.error });
        if (!settings.hasApiKey && !newKey.trim()) {
          return setNotice({ kind: 'bad', text: 'Enter the API key from the hospital system.' });
        }
        // Must run inside this click: Chrome only shows the permission prompt for a user gesture.
        const granted = await browser.permissions.request({ origins: [check.originPattern] });
        if (!granted) {
          return setNotice({ kind: 'bad', text: `Access to ${check.host} was not granted, so Live mode cannot be used.` });
        }
        savedUrl = check.url;
      }
      const next = await saveSettings({
        mode,
        endpointUrl: savedUrl,
        previewBeforeSend: preview,
        ...(newKey.trim() ? { apiKey: newKey.trim() } : {}),
      });
      setUrl(next.endpointUrl);
      setNewKey('');
      onSaved(toPublic(next));
      setNotice({ kind: 'ok', text: 'Saved.' });
    } catch (err) {
      setNotice({ kind: 'bad', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    const next = await saveSettings({ apiKey: '' });
    onSaved(toPublic(next));
    setNotice({ kind: 'ok', text: 'API key removed.' });
  }

  async function test() {
    setNotice(null);
    setBusy(true);
    try {
      const res = (await browser.runtime.sendMessage({ type: 'TEST_CONNECTION' })) as TestConnectionResponse;
      setNotice(res.ok ? { kind: 'ok', text: `Connected (${res.ms} ms).` } : { kind: 'bad', text: res.error });
    } catch (err) {
      setNotice({ kind: 'bad', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <fieldset className="field">
        <legend>Data source</legend>
        <div className="seg" role="radiogroup">
          <button role="radio" aria-checked={mode === 'demo'} className={mode === 'demo' ? 'on' : ''} onClick={() => setMode('demo')}>
            Demo
          </button>
          <button role="radio" aria-checked={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>
            Live
          </button>
        </div>
        <p className="note">
          {mode === 'demo'
            ? 'Demo uses built-in sample data. Nothing leaves this browser.'
            : 'Live sends the field list and record ids to the hospital system below. Nothing else from the page is sent.'}
        </p>
      </fieldset>

      <label className="field">
        <span>Hospital system URL</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://api.hospital.example/chartfill"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={mode === 'demo'}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="field">
        <span>API key {settings.hasApiKey && <em className="saved">saved</em>}</span>
        <input
          type="password"
          placeholder={settings.hasApiKey ? 'Type to replace the saved key' : 'Paste the key'}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          disabled={mode === 'demo'}
          autoComplete="off"
          spellCheck={false}
        />
        {settings.hasApiKey && (
          <button className="link" onClick={removeKey}>
            Remove saved key
          </button>
        )}
      </label>

      <label className="check">
        <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
        <span>Show what will be sent and ask before sending</span>
      </label>

      <div className="actions">
        <button className="primary" onClick={save} disabled={busy || !dirty}>
          Save
        </button>
        <button className="secondary" onClick={test} disabled={busy || dirty || settings.mode !== 'live'} title={dirty ? 'Save first' : undefined}>
          Test connection
        </button>
      </div>

      {notice && <div className={notice.kind === 'ok' ? 'msg ok' : 'msg bad'}>{notice.text}</div>}

      <p className="note">
        The key is stored on this device only, is used only by the extension's background process, and is never shown again
        after saving. Chrome asks you to allow access to the hospital's address when you save in Live mode.
      </p>
    </>
  );
}

export default SettingsView;
