# Product shape and pitch plan

Working name: **ChartFill** (placeholder; rename freely).
One-liner: *Review-first autofill for EHR forms. It fills the form, you check it, you hit Save.*

## 1. Honest review of where the tool is today

What is already strong (lead with these in the pitch):

- **The safety design is the product.** The key contract (`bindFields` -> `FieldRequest` -> `planWriteBack`) means the API never sees the page, selectors never leave the browser, an ambiguous or missing field is skipped rather than guessed, and a response for the wrong capture is rejected. Most "autofill" tools can't say this.
- It never submits a form. A human always clicks Save.
- No backend, no database. PHI exists only in the browser for the length of one operation. That is a big HIPAA-conversation simplifier.
- Runtime capture, so it survives markup changes on EHR pages that expose no stable ids.

What will hurt you in a pitch today:

| Gap | Why it matters | Where |
|---|---|---|
| **Nothing actually fills the form.** The last step is a stub, and `lastCapture` is `void`-ed. | The audience's first question is "show me it filling." | `content.ts:20`, `sendSchema.ts` |
| The UI is a developer console: raw JSON preview and a "Send to API" button. | Reads as a prototype, not a product. Buyers don't think in JSON. | `popup/App.tsx` |
| The third-party API doesn't exist, so a live demo can't depend on it. | A demo that depends on something you don't control is the way pitches fail. | `sendSchema.ts` |
| One form, 14 fields, one host. Procedure codes table not covered. | Looks narrow. Needs a believable coverage story. | `examForm.config.ts` |
| A popup closes the moment you click the page. | You can't review fills while the popup is open. | popup entrypoint |
| No settings or API key page, no history, no errors a non-developer can act on. | Gaps in "who runs this in production" questions. | not built |
| `console.log` of request keys, and the architecture notes a PHI-logging caveat. | A reviewer reading code will flag it. | `sendSchema.ts:21` |

## 2. The product in one picture

**The operator's flow is one click, not three steps:**

```
Open exam page  ->  pill appears: "Exam form detected - Fill from record"
                ->  click
                ->  fields fill with highlights + per-field status
                ->  operator reviews (side panel lists every change)
                ->  operator clicks the EHR's own Save
```

Principle: **the human is always the last step, and the UI makes that obvious.**

## 3. UI shape

### 3.1 Surfaces

1. **In-page pill** (content script, bottom-right). Appears only when a known form is detected. States: *Detected* -> *Filling* -> *Review N fields* -> *Done*. This is the primary surface; the operator never has to open anything.
2. **Side panel** (replaces the popup; Chrome `sidePanel` API). Stays open while the operator works the page. Contains the review list.
3. **Options page.** API connection (key, endpoint, "Test connection"), allowed sites, behavior toggles.
4. **Popup** shrinks to a launcher: status, "Open panel", on/off switch.

### 3.2 Side panel layout (top to bottom)

- **Header**: product name, connection dot (Connected / Demo mode / Offline), pause switch.
- **Context card**: form type ("Eye Exam"), patient reference (record id only, never name unless the page already shows it), capture time.
- **Primary action**: `Fill from record`. After filling it becomes `Re-fill`.
- **Summary strip**: `11 filled - 2 no data - 1 needs attention`, with a progress ring.
- **Field list**: one row per field with label, the value written, and a status chip:
  - Filled (green)
  - No data (grey; field left blank)
  - Already had a value (amber; **not overwritten** unless the operator chooses)
  - Couldn't find on page (red; "missing" or "ambiguous" from `bindFields`)
  - Click a row -> scrolls to and flashes that field on the page.
- **Per-field actions**: Undo, Edit, Accept all.
- **Footer**: a fixed line, "ChartFill never saves or submits. Review, then click Save in your EHR."
- **Developer drawer** (collapsed, behind a toggle): the raw request JSON that the popup shows today. Keep it, since it's your proof that no PHI leaves, but demote it.

### 3.3 Visual language

Calm clinical: white / slate surfaces, one teal accent, status colors used only for status. Dark mode via `prefers-color-scheme`. 14px base, 8px grid. Highlight filled fields on the page with a soft teal outline that fades after 3s so it doesn't permanently alter the page.

A clickable mockup of exactly this is in [mockup.html](mockup.html). Open it in a browser and use it as the demo backdrop or in slides.

## 4. Feature set

### Must have for the pitch (build first)

1. **Fill step** (Phase 5): write values into the DOM from `planWriteBack`, dispatch `input` and `change` events, handle `select` and checkbox/radio, return per-field results.
2. **Demo data provider**: a `DataSource` interface with two implementations, `MockDataSource` (canned realistic patient data, deterministic) and `ApiDataSource` (the real one later). `sendSchema` becomes `fetchValues`. The pitch runs entirely on the mock, so no network dependency can sink it.
3. **Don't-overwrite rule**: a field that already has a value is skipped and flagged amber by default.
4. **Undo**: keep prior values per capture; one click restores a field or all fields.
5. **Side panel + in-page pill + status chips** as in section 3.
6. **Remove PHI-adjacent logging**; keys only.
7. **Branding pass**: name, icon set, consistent copy (no "Send to API", no "schema").

### Should have (makes it feel like a product)

- Options page with connection test and a clear "Demo mode" banner when no API key is set.
- Local, PHI-free **activity log**: time, form type, counts filled / skipped / failed. Keys only, never values. Gives you the "audit trail" answer.
- **Time-saved counter** (fields filled x configurable seconds per field). It's a weak metric technically, but it is the line the buyer repeats to their boss.
- Procedure codes table support (row/column-aware binding), since it's the highest-value part of an exam form.
- Keyboard shortcut for Fill, and Esc to dismiss highlights.

### Later (roadmap slide, not demo)

- claimForm and appointmentForm, plus a **form-config authoring helper**: a capture mode that lists discovered labels so adding a form is config work, not code.
- Multi-EHR host support.
- Org admin: policy (allowed forms and sites), pushed config, usage report.
- Confidence scoring and source attribution per value ("from lab result, 3 Oct").

## 5. Pitch narrative (about 8 minutes)

1. **Pain (1 min).** Operators retype patient data into EHR forms field by field. Slow, error-prone. Show the real form.
2. **Why existing autofill fails (1 min).** EHR markup has no stable ids; generic autofill guesses; in healthcare a wrong guess in a chart is a patient-safety problem.
3. **Demo (3 min).** On the exam page: click the pill, fields fill, side panel lists 11 filled / 2 no data / 1 already filled. Click a row to jump to the field. Undo one. Click Save yourself. Say out loud: "it never pressed Save."
4. **How it stays safe (1.5 min).** One diagram: the API gets keys only; selectors never leave the browser; ambiguous fields are skipped; wrong-capture responses are rejected; no backend, no database.
5. **Coverage and roadmap (1 min).** Exam today, claims and appointments next, config-driven.
6. **Ask (0.5 min).** Pilot with N operators for 2-4 weeks, success measured in minutes saved per exam and error rate.

## 6. Demo-day risk list

| Risk | Mitigation |
|---|---|
| Live site, login or network fails | Local replica page of the exam form (static HTML copied from the real markup) plus a screen recording as fallback |
| Third-party API not ready | `MockDataSource` is the demo path; say plainly it is mocked and that the contract is fixed |
| Selector breaks on the live page | Rehearse on the exact page; capture is runtime so it's resilient, but have the replica ready |
| "Is it HIPAA compliant?" | Don't claim compliance. Say: no backend, no PHI at rest, keys-only logging, BAA and the API vendor's controls are the next conversation |
| "Does Eyefinity allow this?" | Find out before the pitch. It's the biggest non-technical risk: check their terms and whether automating the UI is permitted for the customer's licence |
| Question about errors: "what if it fills wrong?" | Your best answer: status chips, no-overwrite, undo, human Save. Have this slide ready |

## 7. Suggested build order (about 1 to 2 weeks)

1. `DataSource` interface + `MockDataSource`; rename `sendSchema` -> `fetchValues`.
2. Fill engine + undo + no-overwrite (unit tests with jsdom, like the capture tests).
3. Content-script messaging for fill, results, and scroll-to-field.
4. Side panel UI (React, reusing the existing message types) + in-page pill.
5. Options page and activity log.
6. Local replica exam page and the rehearsed demo script.

## 8. Audience: a hospital buying data-entry automation

This changes what wins the room. A hospital buyer is really three people: the **department lead** (wants hours back), **IT / security / compliance** (can veto), and **clinical leadership** (cares about patient safety). Pitch to all three.

What each will ask, and the answer the product already gives or needs:

| Who | Question | Answer / gap |
|---|---|---|
| Ops lead | How much time does it save? | Measure it in the pilot: minutes per exam before vs after. Build the time-saved counter and activity log (section 4). |
| Clinical lead | What if it enters something wrong? | Never overwrites existing values, per-field review, undo, human clicks Save, ambiguous fields are skipped. This is built. |
| Security | Where does patient data go? | Nowhere new: no backend, no DB, PHI only in the browser during an operation. Only field keys and a record id go to the data source. Say what the data source is, because that is where PHI actually lives. |
| Compliance | Is it HIPAA compliant? | Don't claim it. Say it is designed for minimum-necessary data and no PHI at rest, and that a BAA covers whichever service supplies the data. |
| Compliance | Is there an audit trail? | Not yet. Build a local, PHI-free log (who, when, form, counts) and plan an export. This is the most likely hospital-specific ask. |
| IT | How is it deployed and controlled? | Chrome/Edge enterprise policy install, locked to approved hosts, with an admin kill switch. Not built; put on the roadmap slide. |
| IT | What EHR does it support? | Today only Eyefinity Encompass (an optometry practice-management system). If the hospital runs Epic, Cerner or another EHR, the capture engine carries over but each form is new config work. **Confirm their EHR before the pitch.** |

Pitch framing for a hospital: sell a **2-4 week supervised pilot on one form in one department**, not a hospital-wide rollout. Success metrics: minutes saved per form, fields corrected after fill, and zero unreviewed saves. A small, reversible pilot is what a hospital can say yes to.

Be ready to answer "who maintains it when the EHR changes?" Runtime capture plus label-based config means a form change is usually a config edit, not a rebuild.

## 9. Status (what is built vs planned)

Built: capture, key binding, request builder, write-back planning, **fill engine** (`src/capture/applyWrites.ts`: no-overwrite, per-field status, undo), **demo data source** (`src/api/fetchValues.ts`), **side panel** (`entrypoints/sidepanel/`, opens from the toolbar icon and stays open) with a Fill tab (one click, per-field review, undo, "Demo data" badge) and an Activity tab, **PHI-free activity log** (`src/log/`: counts and timestamps only, local storage, CSV export, estimated time saved).

Not built yet: in-page pill, options page (API key, connection test), procedure-codes table, the real API adapter, branding assets (icons), local replica page for demos, admin kill switch and enterprise deployment.

## 10. Things I still need from you

- Which EHR does the target hospital use, and which form or workflow is the pain point?
- Is the pitch a live demo, a recorded one, or slides?
- Is "ChartFill" acceptable as a placeholder name?
