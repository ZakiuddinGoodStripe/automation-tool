# Architecture

## Problem

Operators fill EHR-related forms (exam, claim, appointment, ...) by hand, copying
data from a separate system (patient info, procedure codes, etc.) field by field.
This extension automates the copy step: it reads the live form's structure, asks
a data source for the matching values, fills the fields, and leaves the human to
review and click **Save** themselves. The extension never submits a form.

## Design goals

- **Accuracy over automation**: wrong data silently filled into a patient record
  is worse than not filling it. The extension never guesses at field identity -
  it reads it directly off the live page.
- **Form-agnostic**: support a known, finite set of form types (exam, claim,
  appointment, ...) by detecting which one is open, not one-off code per form.
- **No hand-maintained selectors**: real EHR markup (confirmed against Eyefinity
  Encompass) doesn't expose stable, guessable element ids. Rather than
  hand-writing and constantly re-guessing a selector per field, the extension
  **captures the page's actual structure at runtime** and sends that to the
  API, asking for data shaped to match it.
- **Decoupled from the API**: the third-party API team is still building their
  API. The capture/send pipeline is fully buildable and testable today behind
  a stub, and swapping in the real endpoint later touches exactly one file.
- **No unnecessary data at rest**: no backend, no database. The extension talks
  directly to the (future) third-party API. PHI lives in the browser only as
  long as an operation needs it.

## High-level flow

```
            ┌───────────────────────────┐
            │   Target EHR web page     │
            │   (exam / claim / ...)     │
            └─────────────┬─────────────┘
                          │ DOM
                          ▼
            ┌───────────────────────────┐
            │      Content script       │
            │  1. detect form type      │
            │     (URL route match)     │
            │  2. capture page schema   │
            │     (auto-discovered      │
            │      fields, not config)  │
            └─────────────┬─────────────┘
                          │ CapturedSchema JSON
                          ▼
            ┌───────────────────────────┐
            │        Popup UI           │
            │  3. preview captured JSON │
            └─────────────┬─────────────┘
                          │ "Send to API"
                          ▼
            ┌───────────────────────────┐
            │   Background service      │
            │       worker              │
            │  - owns API key (future)  │
            │  - calls sendSchema()     │
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │      sendSchema()         │
            │  (swappable; stub today)  │
            │                           │
            │  Stub → logs + "not       │  (today)
            │         connected yet"    │
            │  Real → POSTs schema,     │  (once API ships)
            │         returns fill      │
            │         values keyed by   │
            │         the same field    │
            │         keys              │
            └───────────────────────────┘
```

The only thing that changes when the real API ships is `sendSchema()`'s
implementation (and, once it returns real values, adding a fill step that
writes them back into the DOM using each field's already-captured `selector`
— no new selector logic needed, since capture already proved those selectors
resolve on the live page).

## Components

### 1. Form Registry (`src/forms/`)

Identifies *which* known form type is open, by URL route - EHR routes are
reliably form-specific, so this is the primary (and usually only) signal:

```ts
interface FormMatch {
  urlPattern: string;      // regex tested against the page URL
  domSignature?: string;   // optional secondary check, for ambiguous routes
}

interface FormConfig {
  formType: string;        // "examForm" | "claimForm" | "appointmentForm" | ...
  match: FormMatch;
}
```

Configs live in `src/forms/<formType>.config.ts` and are collected in
`src/forms/registry.ts`. `src/forms/detectForm.ts` does the matching and is
unit tested (`detectForm.test.ts`) independent of any real DOM.

Note what this *doesn't* do: it does not declare field selectors. That used
to be a hand-maintained `FieldConfig[]` per form, but real target pages don't
expose stable ids to hand-write against - see Capture below.

### 2. Schema Capture (`src/capture/`)

The core of the current approach: scans the live page for every fillable
field and builds a JSON description of it, instead of relying on a
hand-written config.

```ts
interface CapturedField {
  key: string;              // derived from the resolved label, unique within the schema
  label: string;            // best-effort human label
  selector: string;         // CSS selector that resolves back to this exact element
  elementType: 'input' | 'select' | 'textarea';
  inputType?: string;       // input[type], when applicable
  currentValue: string;
  options?: { value: string; text: string }[]; // for <select>
}

interface CapturedSchema {
  formType: string | null;
  url: string;
  capturedAt: string;
  fields: CapturedField[];
}
```

- `captureSchema.ts`: walks `input`/`select`/`textarea` elements, filters out
  non-fillable ones (hidden/submit/button inputs, anything not laid out /
  `offsetParent === null`), and builds one `CapturedField` per remaining
  element.
- `resolveLabel.ts`: best-effort label resolution - `<label for>`, then
  `aria-label`/`aria-labelledby`, then an enclosing `<label>`, then nearby
  row/cell text (common in table-based EHR grids like Eyefinity's Procedure
  Codes table), then placeholder/name/id, in that order.
- `generateSelector.ts`: prefers a unique `id`; otherwise builds a
  `tag:nth-of-type` path up a few ancestors. Checks element kind by
  `tagName`, not `instanceof`, so it isn't tied to a single DOM realm
  (matters for both iframes and testing).
- `slugify.ts`: turns a label into a stable, de-duplicated field key.
- All four are unit tested against real-ish markup fixtures (jsdom), including
  the "no `<label for>`, must fall back to row text" and "skip hidden fields"
  cases.

### 3. Content script (`entrypoints/content.ts`)

- Detects the form type via the registry (URL match).
- Handles two messages from the popup: `DETECT_FORM` (returns the detected
  `formType`) and `CAPTURE_SCHEMA` (runs `captureSchema` and returns the
  result).
- Read-only: capturing never writes to the page. No submit/save is ever
  triggered from here.

### 4. Background service worker (`entrypoints/background.ts`)

- The only place that will hold an API key once the real API ships, and the
  only place that will call it from.
- Handles `SEND_SCHEMA`: calls `sendSchema()` and returns its result.

### 5. `sendSchema()` (`src/api/sendSchema.ts`)

```ts
function sendSchema(schema: CapturedSchema): Promise<SendSchemaResult>
```

Stub today - logs the schema and returns `{ sentToRealApi: false, message: "..." }`
so the UI can show the pipeline is wired without claiming data was sent
anywhere. The one function to replace with a real `fetch()` call (bearing the
operator's API key) once the third-party API exists.

### 6. Popup UI (`entrypoints/popup/`)

Three-step flow, matching how an operator actually uses this:
1. **Capture page structure** - detects the form and runs schema capture.
2. **Preview captured JSON** - shown read-only before anything is sent, so an
   operator (or developer) can sanity-check exactly what would go out.
3. **Send to API** - currently hits the stub; will carry the real request/response
   once the API exists.

### The key contract (request, response, write-back)

The DB never sees the page. It sees fixed keys, and every value it returns is
joined back to a page field by that key.

- **Keys are defined in the form config** (`FormConfig.fields`: `{ key, label }`),
  not derived from page text, so a label change can't rename a key.
- **Capture** discovers fields at runtime, then `bindFields()` binds each key to
  exactly one field by label. A key that matches nothing (`missing`) or more
  than one field (`ambiguous`) is not bound and not sent. Nothing is guessed.
- **Request** (`FieldRequest`): `{ captureId, formType, context, keys[] }`.
  `context` (e.g. `patientId`) is read from URL params named in the config.
  No labels, selectors, or current values.
- **Local map**: the content script keeps `key -> field (selector)` in memory
  for that capture. Selectors never leave the browser.
- **Response** (`FieldResponse`): `{ captureId, values: { key: value | null } }`.
  Absent or null = no data; the field stays blank.
- **Write-back** (`planWriteBack`): rejects a response whose `captureId` doesn't
  match; writes only keys that were requested and bound; reports `noData` and
  `unexpected` keys instead of writing them.

## Security notes (apply once the real API lands)

- API key entered by each operator/org via an options page (not yet built),
  stored in `chrome.storage.local` only - never `chrome.storage.sync`, never
  hardcoded.
- All calls to the real API happen from the background worker over HTTPS;
  the content script and popup never see the key.
- No PHI persisted beyond the active capture/send operation.
- Log field *keys*, never field *values*, in any debug/console output -
  `sendSchema`'s current `console.log` of the full schema is fine for local
  dev against mock/test pages, but should be removed or redacted before this
  ever runs against real patient data.

## Known form types (finite list - fill in as confirmed)

| formType | Status | Notes |
|---|---|---|
| examForm | in progress | Eyefinity Encompass "Edit Exam" page (`/Patient/NewExam`); capture confirmed working, API not connected yet |
| claimForm | planned | |
| appointmentForm | planned | |

## Build phases

1. ~~Form Registry + config loader.~~ done
2. ~~Schema capture engine (auto-discovers fields from the live DOM).~~ done
3. ~~Popup: capture → preview → send (stub).~~ done
4. Swap `sendSchema()` for the real API call once it ships; parse its
   response into `{ fieldKey: value }`.
5. Fill step: write returned values into the DOM using each field's already-
   captured `selector`, with per-field status (filled / no-data), dispatching
   `input`/`change` events.
6. Repeat capture for claimForm / appointmentForm once their pages are available.
