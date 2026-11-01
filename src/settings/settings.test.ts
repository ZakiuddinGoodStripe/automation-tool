import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, toPublic, validateEndpoint } from './settings';

describe('validateEndpoint', () => {
  it('accepts https and returns the permission pattern for the host, without port or path', () => {
    const r = validateEndpoint(' https://api.hospital.example:8443/chartfill/v1#top ');
    expect(r).toEqual({
      ok: true,
      url: 'https://api.hospital.example:8443/chartfill/v1',
      host: 'api.hospital.example:8443',
      originPattern: 'https://api.hospital.example/*',
    });
  });

  it('allows plain http only for localhost', () => {
    expect(validateEndpoint('http://localhost:3000/fill').ok).toBe(true);
    expect(validateEndpoint('http://127.0.0.1:3000/fill').ok).toBe(true);
    const r = validateEndpoint('http://api.hospital.example/fill');
    expect(r.ok).toBe(false);
  });

  it('rejects empty, malformed, other schemes and credentials in the URL', () => {
    for (const bad of ['', '   ', 'not a url', 'ftp://host/x', 'https://user:pass@host/x', 'javascript:alert(1)']) {
      expect(validateEndpoint(bad).ok).toBe(false);
    }
  });
});

describe('settings', () => {
  it('never exposes the key to the UI', () => {
    const pub = toPublic({ ...DEFAULT_SETTINGS, apiKey: 'secret' });
    expect(pub).not.toHaveProperty('apiKey');
    expect(pub.hasApiKey).toBe(true);
    expect(toPublic(DEFAULT_SETTINGS).hasApiKey).toBe(false);
  });

  it('survives garbage in storage and defaults to safe demo mode', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ mode: 'weird', endpointUrl: 5, apiKey: null, previewBeforeSend: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ mode: 'live', previewBeforeSend: false }).previewBeforeSend).toBe(false);
  });
});
