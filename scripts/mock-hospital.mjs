// A stand-in for the hospital system, so Live mode can be demoed and tested before their API exists.
// Implements docs/API_CONTRACT.md. Run: npm run mock-api   (listens on http://localhost:8787/chartfill)
// In ChartFill Settings: mode Live, URL http://localhost:8787/chartfill, key demo-key.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.API_KEY ?? 'demo-key';

// Data by Eyefinity patient id (the `patientId` in the request context). Unknown patients get 404.
const PATIENTS = {
  '3717251': {
    provider: 'Dr. Priya Bhuta',
    'diagnosis.A': 'H40.1131',
    'diagnosis.B': 'E11.9',
    'exam.cpt': '92004',
    'exam.diagnoses': ['A', 'B'],
    'exam.modifiers': ['25'],
    'fitting.cpt': '92310',
    'procedure.cpt': '92134',
    'procedure.diagnoses': ['A'],
    'procedure.modifiers': ['RT'],
    dilationPerformed: 'Yes',
    diabetes: true,
    highCholesterol: true,
    hypertension: true,
    cataract: true,
    glaucoma: true,
  },
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.startsWith('/chartfill')) return send(res, 404, { error: 'not_found' });
  if (req.headers.authorization !== `Bearer ${API_KEY}`) return send(res, 401, { error: 'bad_key' });

  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'bad_json' });
    }
    const { captureId, formType, context = {}, keys } = body;
    if (typeof captureId !== 'string' || !Array.isArray(keys)) return send(res, 400, { error: 'bad_request' });

    // Connection test: no keys, no record.
    if (formType === 'connectionTest') return send(res, 200, { captureId, values: {} });

    const patient = PATIENTS[context.patientId];
    if (!patient) return send(res, 404, { error: 'patient_not_found' });

    // Answer every requested key; null = no data. Never log values: this stands in for PHI.
    const values = Object.fromEntries(keys.map((k) => [k, patient[k] ?? null]));
    console.log(`${new Date().toISOString()} ${formType} ${keys.length} keys -> ${Object.values(values).filter((v) => v !== null).length} values`);
    send(res, 200, { captureId, values });
  });
}).listen(PORT, () => console.log(`Mock hospital system on http://localhost:${PORT}/chartfill (key: ${API_KEY})`));
