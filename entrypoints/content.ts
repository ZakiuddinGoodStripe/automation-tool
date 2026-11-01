import { formRegistry } from '../src/forms/registry';
import { detectForm } from '../src/forms/detectForm';
import { captureSchema } from '../src/capture/captureSchema';
import { bindSpecs } from '../src/capture/bindFields';
import { buildRequest, extractContext } from '../src/capture/buildRequest';
import { planWriteBack } from '../src/capture/planWriteBack';
import { applyWrites, undoWrites, type UndoEntry } from '../src/capture/applyWrites';
import type { CapturedField, FieldRequest } from '../src/capture/types';
import {
  isApplyFillRequest,
  isCaptureSchemaRequest,
  isDetectFormRequest,
  isUndoFillRequest,
  type ApplyFillResponse,
  type CaptureSchemaResponse,
  type DetectFormResponse,
  type FillProgressMessage,
  type UndoFillResponse,
} from '../src/messages';

// Limited to the confirmed target EHR host. Add hosts here as new form types
// on other domains are confirmed.
export default defineContentScript({
  matches: ['https://pm.eyefinity.com/*'],
  main() {
    // The key -> field map for the latest capture, and what the latest fill changed (for undo).
    let lastCapture: {
      request: FieldRequest;
      bound: Map<string, CapturedField>;
      notBound: string[];
      labels: Record<string, string>;
      undo: UndoEntry[];
    } | null = null;

    // The page-world bridge (page-bridge.content.ts) redraws select widgets such as bootstrap-select after we set the native <select>.
    const refreshWidget = (selector: string) =>
      document.dispatchEvent(new CustomEvent('chartfill:refresh', { detail: selector }));

    function detectFormConfig() {
      return detectForm(formRegistry, window.location.href, document);
    }

    function detectFormType(): string | null {
      return detectFormConfig()?.formType ?? null;
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isDetectFormRequest(message)) {
        const response: DetectFormResponse = { formType: detectFormType() };
        sendResponse(response);
        return undefined;
      }

      if (isCaptureSchemaRequest(message)) {
        try {
          const config = detectFormConfig();
          if (!config) {
            sendResponse({ ok: false, error: 'This page is not a recognized form.' } satisfies CaptureSchemaResponse);
            return undefined;
          }
          const schema = captureSchema(document, config.formType, { scope: config.scope });
          const { bound, missing, ambiguous } = bindSpecs(document, schema, config.fields);
          const request = buildRequest(
            crypto.randomUUID(),
            config.formType,
            extractContext(window.location.href, config.context),
            bound.keys(),
          );
          // Kept in memory only: the key -> field map the write-back step will use. Selectors never leave this script.
          lastCapture = {
            request,
            bound,
            notBound: [...missing, ...ambiguous],
            labels: Object.fromEntries(config.fields.map((f) => [f.key, f.title ?? f.key])),
            undo: [],
          };
          const response: CaptureSchemaResponse = {
            ok: true,
            request,
            report: {
              discovered: schema.fields.length,
              missing,
              ambiguous,
              labels: Object.fromEntries(config.fields.map((f) => [f.key, f.title ?? f.key])),
            },
          };
          sendResponse(response);
        } catch (error) {
          const response: CaptureSchemaResponse = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
          sendResponse(response);
        }
        return undefined;
      }

      if (isApplyFillRequest(message)) {
        const respond = (r: ApplyFillResponse) => sendResponse(r);
        const capture = lastCapture;
        if (!capture) {
          respond({ ok: false, error: 'Nothing captured yet. Capture the page first.' });
          return undefined;
        }
        const plan = planWriteBack(capture.request, capture.bound, message.response);
        if (plan.error) {
          respond({ ok: false, error: plan.error });
          return undefined;
        }
        // Filling waits for fields the page enables step by step, so it answers asynchronously.
        let done = 0;
        applyWrites(document, plan.writes, {
          onChanged: refreshWidget,
          onResult: (result) => {
            done += 1;
            const progress: FillProgressMessage = {
              type: 'FILL_PROGRESS',
              captureId: capture.request.captureId,
              done,
              total: plan.writes.length,
              result,
            };
            // Nobody listening (panel closed) is fine: the final report still arrives.
            browser.runtime.sendMessage(progress).catch(() => undefined);
          },
        })
          .then(({ results, undo }) => {
            capture.undo = undo;
            respond({
              ok: true,
              report: { results, noData: plan.noData, notBound: capture.notBound, labels: capture.labels },
            });
          })
          .catch((error) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        return true;
      }

      if (isUndoFillRequest(message)) {
        const respond = (r: UndoFillResponse) => sendResponse(r);
        if (!lastCapture) {
          respond({ ok: false, error: 'Nothing to undo.' });
          return undefined;
        }
        const restored = undoWrites(document, lastCapture.undo, message.keys, { onChanged: refreshWidget });
        lastCapture.undo = lastCapture.undo.filter((u) => !restored.includes(u.key));
        respond({ ok: true, restored });
        return undefined;
      }

      return undefined;
    });
  },
});
