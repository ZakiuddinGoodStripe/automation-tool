import { useState } from 'react';
import type {
  CaptureReport,
  CaptureSchemaResponse,
  DetectFormResponse,
  SendSchemaResponse,
} from '@/src/messages';
import type { FieldRequest } from '@/src/capture/types';
import type { SendSchemaResult } from '@/src/api/sendSchema';
import './App.css';

type Phase = 'idle' | 'capturing' | 'captured' | 'sending' | 'sent' | 'error';

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab.');
  }
  return tab.id;
}

function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [formType, setFormType] = useState<string | null>(null);
  const [request, setRequest] = useState<FieldRequest | null>(null);
  const [report, setReport] = useState<CaptureReport | null>(null);
  const [sendResult, setSendResult] = useState<SendSchemaResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function capturePage() {
    setPhase('capturing');
    setError(null);
    try {
      const tabId = await getActiveTabId();

      const detectResponse = (await browser.tabs.sendMessage(tabId, {
        type: 'DETECT_FORM',
      })) as DetectFormResponse;
      setFormType(detectResponse.formType);

      const captureResponse = (await browser.tabs.sendMessage(tabId, {
        type: 'CAPTURE_SCHEMA',
      })) as CaptureSchemaResponse;

      if (!captureResponse.ok) {
        setError(captureResponse.error);
        setPhase('error');
        return;
      }

      setRequest(captureResponse.request);
      setReport(captureResponse.report);
      setSendResult(null);
      setPhase('captured');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  async function sendToApi() {
    if (!request) return;
    setPhase('sending');
    setError(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'SEND_SCHEMA',
        request,
      })) as SendSchemaResponse;

      if (!response.ok) {
        setError(response.error);
        setPhase('error');
        return;
      }

      setSendResult(response.result);
      setPhase('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  return (
    <main className="popup">
      <h1>Form Fill Assistant</h1>

      <ol className="steps">
        <li className={request ? 'done' : phase === 'capturing' ? 'active' : ''}>
          1. Capture page structure
        </li>
        <li className={sendResult ? 'done' : phase === 'sending' ? 'active' : ''}>
          2. Preview captured JSON
        </li>
        <li className={sendResult ? 'done' : ''}>3. Send to API</li>
      </ol>

      <button onClick={capturePage} disabled={phase === 'capturing'}>
        {phase === 'capturing' ? 'Capturing…' : 'Capture page structure'}
      </button>

      {request && (
        <>
          <pre className="schema-preview">{JSON.stringify(request, null, 2)}</pre>
          <button onClick={sendToApi} disabled={phase === 'sending'}>
            {phase === 'sending' ? 'Sending…' : 'Send to API'}
          </button>
        </>
      )}

      {sendResult && (
        <p className={sendResult.sentToRealApi ? 'send-ok' : 'send-stub'}>
          {sendResult.message}
        </p>
      )}

      {phase === 'error' && error && (
        <div className="error">
          <p>{error}</p>
        </div>
      )}

      <p className="save-reminder">
        Nothing on the page is modified by capturing or sending — this only reads the
        page's structure.
      </p>
    </main>
  );
}

export default App;
