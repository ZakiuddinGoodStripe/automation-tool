# Hospital system API contract (draft v1)

What ChartFill needs from the hospital's system. One endpoint. ChartFill reads the
exam page, asks for the values of a fixed list of fields, and fills what comes back.
The operator reviews and saves; ChartFill never saves or submits.

## Endpoint

`POST {configured URL}` over **HTTPS**, JSON in and out.

| Header | Value |
|---|---|
| `Authorization` | `Bearer <API key>` |
| `Content-Type` | `application/json` |
| `Accept` | `application/json` |

Redirects are not followed (the key must never travel to another host). No cookies are sent.

## Request

```json
{
  "captureId": "9f2c0c1e-6b5a-4d0e-9d0a-2f6d3a1b7e11",
  "formType": "examForm",
  "context": { "patientId": "3717251", "examId": "0" },
  "keys": ["provider", "diagnosis.A", "diagnosis.B", "diagnosis.C", "diagnosis.D", "diagnosis.E",
           "diagnosis.F", "diagnosis.G", "diagnosis.H", "diagnosis.I", "diagnosis.J", "diagnosis.K",
           "diagnosis.L", "exam.cpt", "exam.diagnoses", "exam.modifiers", "fitting.cpt",
           "fitting.diagnoses", "fitting.modifiers",
           "procedure.cpt", "procedure.diagnoses", "procedure.modifiers", "pqrs.cpt", "pqrs.modifiers",
           "dilationPerformed", "preDiabetes", "diabetes", "diabeticRetinopathy",
           "highCholesterol", "hypertension", "abnormalPupil", "arcus", "armd",
           "cataract", "glaucoma", "pcpForm"]
}
```

- `captureId` identifies this request. **Echo it back.** ChartFill discards any answer whose
  `captureId` differs.
- `context` holds record identifiers read from the page URL. Today that is the **Eyefinity**
  patient and exam ids. How these map to the hospital's own patient identifier is open (see below).
- `keys` is the list of fields wanted, in the order they will be filled. Nothing else about the
  page is sent: no labels, no selectors, no current field values, no patient name or date of birth.
- `formType: "connectionTest"` with empty `context` and `keys` is a connectivity check from the
  Settings screen. Answer it with `200` and `{ "captureId": ..., "values": {} }`.

## Response (`200`)

```json
{
  "captureId": "9f2c0c1e-6b5a-4d0e-9d0a-2f6d3a1b7e11",
  "values": {
    "provider": "Dr. Priya Bhuta",
    "diagnosis.A": "H40.1131",
    "diagnosis.B": "E11.9",
    "exam.cpt": "92004",
    "exam.diagnoses": ["A", "B"],
    "exam.modifiers": ["25"],
    "fitting.cpt": "92310",
    "fitting.modifiers": null,
    "procedure.cpt": "92134",
    "procedure.modifiers": ["RT"],
    "dilationPerformed": "Yes",
    "diabetes": true,
    "pcpForm": null
  }
}
```

- Each value is a **string**, a **boolean**, a **list of strings**, or **`null`**.
- **`null` or an absent key means "no data"**: the field stays blank. Never send `""` for "unknown".
- Keys that were not requested are ignored.

### Field values

| Key | Value | Notes |
|---|---|---|
| `provider` | Provider's full name | Must match the name in Eyefinity exactly, e.g. `Dr. Priya Bhuta` |
| `diagnosis.A` to `diagnosis.L` | One ICD-10-CM code, e.g. `"H40.1131"` | Dots optional. The page only reveals each box after the one before it is filled, so **send A, then B, then C with no gaps**; a code sent without its predecessor is reported as "Not ready". The letter is the pointer procedure rows use. The code must match exactly one result in Eyefinity's search, otherwise it is refused and flagged. |
| `exam.cpt`, `fitting.cpt`, `procedure.cpt`, `pqrs.cpt` | Plain code, e.g. `"92004"` | Matched against the code at the start of Eyefinity's option text. A code that matches no option, or more than one, is refused and flagged to the operator, never guessed. |
| `exam.diagnoses`, `fitting.diagnoses`, `procedure.diagnoses` | List of pointer **letters**, e.g. `["A","B"]` | Which of the diagnoses above this row bills against. At most 4. Each letter must have a diagnosis filled (`diagnosis.A` ...), or it is refused and flagged. Send these together with the matching `diagnosis.*` and the row's `*.cpt` (the page enables the list only after the code is set). The PQRS row has none. |
| `exam.modifiers`, `fitting.modifiers`, `procedure.modifiers` | List of plain modifier codes, e.g. `["25","RT"]` | At most 4. |
| `pqrs.modifiers` | List with one code, e.g. `["1P"]` | |
| `dilationPerformed` | `"Yes"` or `"No"` (or `"No (reason on file)"`) | |
| `preDiabetes`, `diabetes`, `diabeticRetinopathy`, `highCholesterol`, `hypertension`, `abnormalPupil`, `arcus`, `armd`, `cataract`, `glaucoma`, `pcpForm` | `true` / `false` | `true` ticks the box. `false` never unticks a box the operator already ticked. |

Fields that already hold a different value on the page are **never overwritten**; they are shown
to the operator as "Kept existing".

## Errors

| HTTP | Meaning | Shown to the operator |
|---|---|---|
| `401`, `403` | Bad or revoked API key | "The hospital system rejected the API key." |
| `404` | No data for this record | "The hospital system has no data for this record." |
| `5xx` | Server problem | "The hospital system reported an error (HTTP 503)." |
| other `4xx` | Request refused | "... refused the request (HTTP 422)." |
| no answer in 15 s | | "... did not answer within 15 seconds." |

Error bodies are not shown to the operator, so they may contain a code for your logs but should
carry no patient data.

## Planned, not in v1

- Extra Procedure and PQRS rows.
- A batch call returning today's patients, so the operator can work down a list.

## Open questions for the hospital team

1. **Patient identity.** `context.patientId` is Eyefinity's id. Does the hospital system store it,
   or must it match on name and date of birth? (If matching on those, ChartFill would send them,
   which changes the "no patient identifiers beyond record ids" property above.)
2. Authentication: is a static bearer key acceptable, or is OAuth/mTLS required?
3. Can the endpoint be reached from the clinic workstations' browsers (network, firewall, allow-list)?
4. Provider names: confirmed to match Eyefinity exactly. Who maintains that if they diverge?

## Trying it without the hospital system

`npm run mock-api` starts a local server that implements this contract
(`http://localhost:8787/chartfill`, key `demo-key`; it knows patient `3717251`). In ChartFill
Settings choose **Live**, enter that URL and key, save, then **Test connection**.
