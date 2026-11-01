import { formRegistry } from '../src/forms/registry';
import { detectForm } from '../src/forms/detectForm';
import { captureSchema } from '../src/capture/captureSchema';
import { bindFields } from '../src/capture/bindFields';
import { buildRequest, extractContext } from '../src/capture/buildRequest';
import type { CapturedField, FieldRequest } from '../src/capture/types';
import {
  isCaptureSchemaRequest,
  isDetectFormRequest,
  type CaptureSchemaResponse,
  type DetectFormResponse,
} from '../src/messages';

// Limited to the confirmed target EHR host. Add hosts here as new form types
// on other domains are confirmed.
export default defineContentScript({
  matches: ['https://pm.eyefinity.com/*'],
  main() {
    // Used by the (not yet built) fill step with planWriteBack().
    let lastCapture: { request: FieldRequest; bound: Map<string, CapturedField> } | null = null;
    void lastCapture;

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
          const { bound, missing, ambiguous } = bindFields(schema, config.fields);
          const request = buildRequest(
            crypto.randomUUID(),
            config.formType,
            extractContext(window.location.href, config.context),
            bound.keys(),
          );
          // Kept in memory only: the key -> field map the write-back step will use. Selectors never leave this script.
          lastCapture = { request, bound };
          const response: CaptureSchemaResponse = {
            ok: true,
            request,
            report: { discovered: schema.fields.length, missing, ambiguous },
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

      return undefined;
    });
  },
});
