import { useEffect, useRef, useState } from 'react';
import {
  isFillProgress,
  type ApplyFillResponse,
  type CaptureReport,
  type CaptureSchemaResponse,
  type FetchValuesResponse,
  type FillReport,
  type UndoFillResponse,
} from '@/src/messages';
import type { FieldRequest } from '@/src/capture/types';
import type { FieldResult, FillStatus } from '@/src/capture/applyWrites';
import { formatDuration, summarize, toCsv, type ActivityEntry } from '@/src/log/activityLog';
import { clearEntries, loadEntries, recordEntry } from '@/src/log/activityStore';
import { DEFAULT_SETTINGS, toPublic, type PublicSettings } from '@/src/settings/settings';
import { loadSettings } from '@/src/settings/settingsStore';
import SettingsView from './SettingsView';
import './App.css';

type Phase = 'idle' | 'capturing' | 'preview' | 'sending' | 'filling' | 'done' | 'error';
type Step = 'capture' | 'preview' | 'send' | 'fill';
type StepState = 'pending' | 'active' | 'done' | 'failed';
type Tab = 'fill' | 'activity' | 'settings';

interface Progress {
  captureId: string;
  done: number;
  total: number;
  results: FieldResult[];
}

const CHIP: Record<FillStatus | 'noData' | 'undone', { text: string; cls: string }> = {
  filled: { text: 'Filled', cls: 'ok' },
  unchanged: { text: 'Already set', cls: 'none' },
  kept: { text: 'Kept existing', cls: 'warn' },
  notFound: { text: 'Not found', cls: 'bad' },
  invalid: { text: 'Invalid value', cls: 'bad' },
  unsupported: { text: 'Unsupported', cls: 'bad' },
  notReady: { text: 'Not ready', cls: 'bad' },
  noData: { text: 'No data', cls: 'none' },
  undone: { text: 'Undone', cls: 'none' },
};

const STEP_NAMES: Record<Step, string> = { capture: 'Capture', preview: 'Preview', send: 'Send', fill: 'Fill' };

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');
  return tab.id;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function friendly(err: unknown): string {
  if (err instanceof Error && /Receiving end/i.test(err.message)) {
    return 'Open a supported form page and reload it, then try again.';
  }
  return err instanceof Error ? err.message : String(err);
}

function App() {
  const [tab, setTab] = useState<Tab>('fill');
  const [phase, setPhase] = useState<Phase>('idle');
  const [failedAt, setFailedAt] = useState<Step | null>(null);
  const [request, setRequest] = useState<FieldRequest | null>(null);
  const [capture, setCapture] = useState<CaptureReport | null>(null);
  const [received, setReceived] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<FillReport | null>(null);
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [settings, setSettings] = useState<PublicSettings>(toPublic(DEFAULT_SETTINGS));
  const [sentAt, setSentAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Bumped whenever a run starts or is cancelled; a reply that arrives for an older run is ignored.
  const run = useRef(0);

  useEffect(() => {
    loadEntries().then(setEntries).catch(() => undefined);
    loadSettings().then((s) => setSettings(toPublic(s))).catch(() => undefined);
  }, []);

  // Fields arrive from the page one by one while it is being filled.
  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (!isFillProgress(message)) return;
      setProgress((prev) =>
        prev && prev.captureId === message.captureId
          ? { ...prev, done: message.done, total: message.total, results: [...prev.results, message.result] }
          : prev,
      );
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  // Seconds spent waiting for the hospital system.
  useEffect(() => {
    if (phase !== 'sending') return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - sentAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [phase, sentAt]);

  function fail(message: string, at: Step) {
    setError(message);
    setFailedAt(at);
    setPhase('error');
  }

  function log(entry: Parameters<typeof recordEntry>[0]) {
    recordEntry(entry)
      .then(setEntries)
      .catch(() => undefined);
  }

  /** Step 1: read the page and build the request. Nothing is sent. */
  async function start() {
    const mine = ++run.current;
    setError(null);
    setReport(null);
    setProgress(null);
    setReceived(null);
    setUndone(new Set());
    setPhase('capturing');
    try {
      const tabId = await getActiveTabId();
      const captured = (await browser.tabs.sendMessage(tabId, { type: 'CAPTURE_SCHEMA' })) as CaptureSchemaResponse;
      if (mine !== run.current) return;
      if (!captured.ok) return fail(captured.error, 'capture');
      setRequest(captured.request);
      setCapture(captured.report);
      if (settings.previewBeforeSend) setPhase('preview');
      else await sendAndFill(captured.request);
    } catch (err) {
      if (mine === run.current) fail(friendly(err), 'capture');
    }
  }

  /** Steps 3 and 4: send, wait for the reply, then fill this record field by field. */
  async function sendAndFill(req: FieldRequest) {
    const mine = ++run.current;
    setError(null);
    setPhase('sending');
    setSentAt(Date.now());
    setElapsed(0);
    let at: Step = 'send';
    try {
      const fetched = (await browser.runtime.sendMessage({ type: 'FETCH_VALUES', request: req })) as FetchValuesResponse;
      if (mine !== run.current) return; // cancelled while waiting: never fill from a reply nobody wants
      if (!fetched.ok) return fail(fetched.error, 'send');
      setReceived(Object.values(fetched.result.response.values).filter((v) => v !== null && v !== undefined).length);

      setProgress({ captureId: req.captureId, done: 0, total: 0, results: [] });
      setPhase('filling');
      at = 'fill';
      const tabId = await getActiveTabId();
      const applied = (await browser.tabs.sendMessage(tabId, {
        type: 'APPLY_FILL',
        response: fetched.result.response,
      })) as ApplyFillResponse;
      if (mine !== run.current) return;
      if (!applied.ok) return fail(applied.error, 'fill');

      setReport(applied.report);
      setPhase('done');

      const results = applied.report.results;
      const count = (...statuses: FillStatus[]) => results.filter((r) => statuses.includes(r.status)).length;
      log({
        action: 'fill',
        formType: req.formType,
        source: fetched.result.source,
        filled: count('filled'),
        kept: count('kept'),
        noData: applied.report.noData.length,
        needsAttention: count('notFound', 'invalid', 'unsupported', 'notReady') + applied.report.notBound.length,
      });
    } catch (err) {
      if (mine === run.current) fail(friendly(err), at);
    }
  }

  function cancelWaiting() {
    run.current += 1;
    setPhase(settings.previewBeforeSend ? 'preview' : 'idle');
  }

  async function undo(keys?: string[]) {
    try {
      const tabId = await getActiveTabId();
      const res = (await browser.tabs.sendMessage(tabId, { type: 'UNDO_FILL', keys })) as UndoFillResponse;
      if (!res.ok) return fail(res.error, 'fill');
      setUndone((prev) => new Set([...prev, ...res.restored]));
      if (res.restored.length > 0) {
        log({
          action: 'undo',
          formType: request?.formType ?? 'unknown',
          source: settings.mode === 'live' ? 'api' : 'demo',
          filled: res.restored.length,
          kept: 0,
          noData: 0,
          needsAttention: 0,
        });
      }
    } catch (err) {
      fail(friendly(err), 'fill');
    }
  }

  const count = (s: FillStatus) =>
    report?.results.filter((r) => r.status === s && !undone.has(r.key)).length ?? 0;
  const needsAttention = report
    ? report.results.filter((r) => ['notFound', 'invalid', 'unsupported', 'notReady'].includes(r.status)).length +
      report.notBound.length
    : 0;
  const undoable = report?.results.filter((r) => r.status === 'filled' && !undone.has(r.key)) ?? [];
  const live = settings.mode === 'live';
  const busy = phase === 'capturing' || phase === 'sending' || phase === 'filling';
  const record = request
    ? Object.entries(request.context)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ') || 'none'
    : '';

  // The stepper: which of the four steps is done, running, or failed.
  const order: Step[] = settings.previewBeforeSend ? ['capture', 'preview', 'send', 'fill'] : ['capture', 'send', 'fill'];
  const current: Step | 'done' | null =
    phase === 'capturing'
      ? 'capture'
      : phase === 'preview'
        ? 'preview'
        : phase === 'sending'
          ? 'send'
          : phase === 'filling'
            ? 'fill'
            : phase === 'done'
              ? 'done'
              : phase === 'error'
                ? failedAt
                : null;
  const stateOf = (step: Step): StepState => {
    if (current === null) return 'pending';
    if (current === 'done') return 'done';
    const at = order.indexOf(current);
    const i = order.indexOf(step);
    if (i < at) return 'done';
    if (i === at) return phase === 'error' ? 'failed' : 'active';
    return 'pending';
  };
  const detailOf = (step: Step): string | undefined => {
    const state = stateOf(step);
    if (step === 'capture' && request && state !== 'pending') return `${request.keys.length} fields`;
    if (step === 'preview') return state === 'done' ? 'reviewed' : state === 'active' ? 'check the JSON' : undefined;
    if (step === 'send') {
      if (state === 'active') return `waiting ${elapsed}s`;
      if (state === 'done' && received !== null) return `${received} values back`;
    }
    if (step === 'fill') {
      if (state === 'active') return `${progress?.done ?? 0} of ${progress?.total || '…'}`;
      if (state === 'done' && report) return `${count('filled')} filled`;
    }
    return undefined;
  };

  return (
    <main className="popup">
      <header className="head">
        <h1>ChartFill</h1>
        <span className={live ? 'badge-live' : 'badge-demo'}>{live ? 'Live' : 'Demo data'}</span>
      </header>

      <nav className="tabs" role="tablist">
        {(['fill', 'activity', 'settings'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'fill' ? 'Fill' : t === 'activity' ? 'Activity' : 'Settings'}
          </button>
        ))}
      </nav>

      {tab === 'settings' && <SettingsView key={JSON.stringify(settings)} settings={settings} onSaved={setSettings} />}

      {tab === 'activity' && (
        <ActivityView entries={entries} onClear={() => clearEntries().then(() => setEntries([]))} />
      )}

      {tab === 'fill' && (
        <>
          {current !== null && (
            <ol className="stepper" aria-label="Progress">
              {order.map((step, i) => {
                const state = stateOf(step);
                const detail = detailOf(step);
                return (
                  <li key={step} className={state} aria-current={state === 'active' ? 'step' : undefined}>
                    <span className="dot">{state === 'done' ? '✓' : state === 'failed' ? '!' : i + 1}</span>
                    <span className="step-name">{STEP_NAMES[step]}</span>
                    {detail && <span className="step-detail">{detail}</span>}
                  </li>
                );
              })}
            </ol>
          )}

          {(phase === 'idle' || phase === 'done' || phase === 'error') && (
            <button className="primary" onClick={start}>
              {settings.previewBeforeSend
                ? report
                  ? 'Capture next patient'
                  : 'Capture page'
                : report
                  ? 'Re-fill from record'
                  : 'Fill from record'}
            </button>
          )}

          {phase === 'capturing' && <p className="note">Reading the page…</p>}

          {phase === 'preview' && request && capture && (
            <section className="preview" aria-label="What will be sent">
              <h2>Step 2: this is exactly what will be sent</h2>
              <dl>
                <dt>To</dt>
                <dd>{live ? hostOf(settings.endpointUrl) : 'Demo data (nothing leaves this browser)'}</dd>
                <dt>Record</dt>
                <dd>{record}</dd>
              </dl>
              <pre className="json" tabIndex={0}>
                {JSON.stringify(request, null, 2)}
              </pre>
              {[...capture.missing, ...capture.ambiguous].length > 0 && (
                <p className="warn-text">
                  Not found on this page, so not requested:{' '}
                  {[...capture.missing, ...capture.ambiguous].map((k) => capture.labels[k] ?? k).join(', ')}
                </p>
              )}
              <p className="note">
                Only field names and record ids are sent. No page content, no current values. When the reply arrives,
                ChartFill fills this patient's form field by field.
              </p>
              <div className="actions">
                <button className="primary" onClick={() => sendAndFill(request)}>
                  Send request
                </button>
                <button className="secondary" onClick={() => setPhase(report ? 'done' : 'idle')}>
                  Cancel
                </button>
              </div>
            </section>
          )}

          {phase === 'sending' && request && (
            <section className="waiting" aria-live="polite">
              <p>
                <strong>Waiting for {live ? hostOf(settings.endpointUrl) : 'the demo data'}…</strong>
              </p>
              <p className="note">
                Sent {request.keys.length} field names for {record}. The form is not touched until the reply arrives.
              </p>
              <button className="secondary" onClick={cancelWaiting}>
                Cancel
              </button>
            </section>
          )}

          {phase === 'filling' && progress && (
            <section aria-live="polite">
              <p className="note">Reply received. Filling this patient's form, one field at a time:</p>
              <ul className="results">
                {progress.results.map((r, i) => (
                  <ResultRow key={`${r.key}-${i}`} result={r} undone={false} />
                ))}
              </ul>
            </section>
          )}

          {phase === 'done' && report && (
            <>
              <div className="summary">
                <span className="chip ok">{count('filled')} filled</span>
                <span className="chip none">{report.noData.length} no data</span>
                <span className="chip warn">{count('kept')} kept</span>
                {needsAttention > 0 && <span className="chip bad">{needsAttention} need attention</span>}
              </div>

              <ul className="results">
                {report.results.map((r) => (
                  <ResultRow key={r.key} result={r} undone={undone.has(r.key)} onUndo={() => undo([r.key])} />
                ))}
                {report.noData.map((key) => (
                  <li key={`nd-${key}`}>
                    <div className="label">{report.labels[key] ?? key}</div>
                    <div className="side">
                      <span className="chip none">No data</span>
                    </div>
                  </li>
                ))}
                {report.notBound.map((key) => (
                  <li key={`nb-${key}`}>
                    <div className="label">{report.labels[key] ?? key}</div>
                    <div className="side">
                      <span className="chip bad">Not found on page</span>
                    </div>
                  </li>
                ))}
              </ul>

              {undoable.length > 1 && (
                <button className="secondary" onClick={() => undo()}>
                  Undo all
                </button>
              )}
            </>
          )}

          {phase === 'error' && error && <div className="msg bad">{error}</div>}

          {!busy && phase !== 'preview' && request && !settings.previewBeforeSend && (
            <details className="dev">
              <summary>Developer: what is sent</summary>
              <pre>{JSON.stringify(request, null, 2)}</pre>
              <p>Field keys and record ids only. No labels, selectors or current values.</p>
              {capture && <p>Discovered {capture.discovered} fields on the page.</p>}
            </details>
          )}
        </>
      )}

      <p className="save-reminder">
        ChartFill never saves or submits. Review the fields, then click <strong>Save</strong> in your EHR.
      </p>
    </main>
  );
}

function ResultRow({ result, undone, onUndo }: { result: FieldResult; undone: boolean; onUndo?: () => void }) {
  const chip = CHIP[undone ? 'undone' : result.status];
  return (
    <li>
      <div>
        <div className="label">{result.label}</div>
        {result.value && !undone && <div className="value">{result.value}</div>}
      </div>
      <div className="side">
        <span className={`chip ${chip.cls}`}>{chip.text}</span>
        {onUndo && result.status === 'filled' && !undone && (
          <button className="link" onClick={onUndo}>
            Undo
          </button>
        )}
      </div>
    </li>
  );
}

function ActivityView({ entries, onClear }: { entries: ActivityEntry[]; onClear: () => void }) {
  const s = summarize(entries);

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(entries)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chartfill-activity.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="stats">
        <div>
          <strong>{s.fills}</strong>
          <span>forms filled</span>
        </div>
        <div>
          <strong>{s.fieldsFilled}</strong>
          <span>fields filled</span>
        </div>
        <div>
          <strong>{formatDuration(s.secondsSaved)}</strong>
          <span>est. time saved</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="note">No activity yet. Fill a form and it will appear here.</p>
      ) : (
        <ul className="results">
          {entries.map((e) => (
            <li key={e.id}>
              <div>
                <div className="label">
                  {e.action === 'fill' ? 'Filled' : 'Undid'} {e.formType}
                </div>
                <div className="value">{new Date(e.at).toLocaleString()}</div>
              </div>
              <div className="side">
                <span className={`chip ${e.action === 'fill' ? 'ok' : 'none'}`}>
                  {e.filled} {e.action === 'fill' ? 'filled' : 'undone'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button className="secondary" onClick={exportCsv} disabled={entries.length === 0}>
          Export CSV
        </button>
        <button className="secondary" onClick={onClear} disabled={entries.length === 0}>
          Clear log
        </button>
      </div>
      <p className="note">
        The log keeps counts and timestamps only. It never stores patient data, field values or record ids, and it
        stays on this device. Time saved assumes 15 seconds of typing per field.
      </p>
    </>
  );
}

export default App;
