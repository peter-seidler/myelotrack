// Configure a SMART source + encryption key BEFORE importing anything that
// reads config (each `node --test` file is its own process, so this is isolated).
process.env.MSK_AUTHORIZE_URL = 'https://fhir.example.org/oauth2/authorize';
process.env.MSK_TOKEN_URL = 'https://fhir.example.org/oauth2/token';
process.env.MSK_FHIR_BASE_URL = 'https://fhir.example.org/api/FHIR/R4';
process.env.MSK_CLIENT_ID = 'client-abc';
process.env.MSK_REDIRECT_URI = 'https://app.myelotrack.local/callback';
process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let server;
let base;
let repo;
const realFetch = globalThis.fetch;

before(async () => {
  // Dynamic import so the env vars set above are in place before config is
  // evaluated (static `import`s are hoisted above top-level statements).
  const { createApp } = await import('../src/app.js');
  const { createMemoryRepository } = await import('../src/repositories/memory/store.js');
  repo = createMemoryRepository();
  const app = createApp(repo);
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  globalThis.fetch = realFetch;
  server?.close();
});

// Stub the upstream Epic endpoints (token + FHIR) for the whole suite.
beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth2/token')) {
      return {
        ok: true,
        json: async () => ({
          access_token: 'access-xyz',
          refresh_token: 'refresh-xyz',
          expires_in: 3600,
          scope: 'patient/Observation.read',
          patient: 'Patient/9',
        }),
      };
    }
    if (String(url).includes('/Observation')) {
      return {
        ok: true,
        json: async () => ({
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Observation',
                id: 'hgb-1',
                code: { coding: [{ system: 'http://loinc.org', code: '718-7' }] },
                valueQuantity: { value: 9.2, unit: 'g/dL' },
                effectiveDateTime: '2026-07-18T00:00:00Z',
              },
            },
          ],
          link: [],
        }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
});

// The test client talks to the local server with the REAL fetch; only the
// server's outbound Epic calls (token/FHIR) hit the stub installed above.
const get = (p) => realFetch(`${base}${p}`);
const post = (p) => realFetch(`${base}${p}`, { method: 'POST' });

test('connect → callback → sync pulls and stores labs over FHIR', async () => {
  // 1. connect: returns an authorize URL and stashes pending PKCE/state.
  const connectRes = await get('/api/v1/integrations/msk/connect');
  assert.equal(connectRes.status, 200);
  const { authorizeUrl } = (await connectRes.json()).data;
  const url = new URL(authorizeUrl);
  assert.equal(url.searchParams.get('client_id'), 'client-abc');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');
  assert.ok(state);

  // 2. callback: exchange the code (stubbed token endpoint) → connected.
  const cbRes = await get(
    `/api/v1/integrations/msk/callback?code=authcode&state=${state}`,
  );
  assert.equal(cbRes.status, 200);
  assert.equal((await cbRes.json()).data.status, 'connected');

  // Tokens are stored encrypted, never in plaintext.
  const conn = repo.getConnection('msk');
  assert.match(conn.tokens.accessTokenEnc, /^v1:/);
  assert.notEqual(conn.tokens.accessTokenEnc, 'access-xyz');

  // 3. sync: real FHIR pull (stubbed bundle) normalizes + upserts.
  const labsBefore = repo.listLabs({ analyte: 'hemoglobin' }).length;
  const syncRes = await post('/api/v1/integrations/msk/sync');
  assert.equal(syncRes.status, 200);
  const result = (await syncRes.json()).data;
  assert.equal(result.fetched, 1);
  assert.equal(result.upserted, 1);
  assert.equal(repo.listLabs({ analyte: 'hemoglobin' }).length, labsBefore + 1);
});

test('callback rejects a mismatched state', async () => {
  await get('/api/v1/integrations/msk/connect');
  const res = await get('/api/v1/integrations/msk/callback?code=x&state=wrong');
  assert.equal(res.status, 400);
});

test('connect on an unconfigured source is rejected', async () => {
  const res = await get('/api/v1/integrations/capital-health/connect');
  assert.equal(res.status, 400); // no CAPITAL_HEALTH_* env set
});
