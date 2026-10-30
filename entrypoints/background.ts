import { sendSchema } from '../src/api/sendSchema';
import { isSendSchemaRequest, type SendSchemaResponse } from '../src/messages';

// This is the only place that will hold the API key once the real
// third-party API ships, and the only place that calls it from.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isSendSchemaRequest(message)) {
      return undefined;
    }

    (async (): Promise<SendSchemaResponse> => {
      try {
        const result = await sendSchema(message.schema);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    })().then(sendResponse);

    return true; // keep the message channel open for the async response
  });
});
