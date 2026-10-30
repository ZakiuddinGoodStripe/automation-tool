import { formRegistry } from '../src/forms/registry';
import { detectForm } from '../src/forms/detectForm';
import { captureSchema } from '../src/capture/captureSchema';
import {
  isCaptureSchemaRequest,
  isDetectFormRequest,
  type CaptureSchemaResponse,
  type DetectFormResponse,
} from '../src/messages';

// Intentionally broad until the real target EHR domains are known; narrow
// this once they're confirmed. Detection is config-gated (urlPattern, and
// optionally domSignature) so the script is a no-op on pages that don't match.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    function detectFormType(): string | null {
      const match = detectForm(formRegistry, window.location.href, document);
      return match?.formType ?? null;
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isDetectFormRequest(message)) {
        const response: DetectFormResponse = { formType: detectFormType() };
        sendResponse(response);
        return undefined;
      }

      if (isCaptureSchemaRequest(message)) {
        try {
          const schema = captureSchema(document, detectFormType());
          const response: CaptureSchemaResponse = { ok: true, schema };
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
