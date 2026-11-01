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

## Connecting to the hospital system

In the side panel, open **Settings**: choose **Live**, enter the hospital system's HTTPS URL and
API key, save (Chrome asks you to allow that one host), then **Test connection**. The request and
response format is in [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Until their API exists,
`npm run mock-api` runs a local stand-in (`http://localhost:8787/chartfill`, key `demo-key`).
