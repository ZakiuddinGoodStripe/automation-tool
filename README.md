# Automation Extension

Browser extension that reads the structure of an EHR-related web form (exam,
claim, appointment, ...), fetches matching data from a data source, fills the
form, and leaves a human to review and save. It never submits a form itself.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design: the
form registry, runtime schema capture, the lean payload sent to the API, the
swappable `sendSchema()` stub (real third-party API later), and the build phases.

## Stack

- [WXT](https://wxt.dev) (Manifest V3, Vite-based) + React + TypeScript
- Vitest for unit tests, Playwright for end-to-end form-fill verification (planned)

## Development

```bash
npm install
npm run dev      # loads the extension in a dev browser with HMR
npm run build    # production build -> .output/chrome-mv3
npm run compile  # typecheck only
```
