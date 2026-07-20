// Configure a SMART source + APP_URL before config is read (own process).
process.env.MSK_AUTHORIZE_URL = 'https://fhir.example.org/oauth2/authorize';
process.env.MSK_TOKEN_URL = 'https://fhir.example.org/oauth2/token';
process.env.MSK_FHIR_BASE_URL = 'https://fhir.example.org/api/FHIR/R4';
process.env.MSK_CLIENT_ID = 'client-abc';
process.env.MSK_REDIRECT_URI = 'https://app.myelotrack.local/callback';
process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.APP_URL = 'https://app.myelotrack.local';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let server;
let base;
const realFetch = globalThis.fetch;

before(async () => {
  const { createApp } = await import('../src/app.js');
  const { createMemoryRepository } = await import('../src/repositories/memory/store.js');
  const app = createApp(createMemoryRepository());
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth2/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'at', patient: 'Patient/1' }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
  server?.close();
});

test('callback redirects to APP_URL when configured', async () => {
  const connect = await realFetch(`${base}/api/v1/integrations/msk/connect`);
  const { authorizeUrl } = (await connect.json()).data;
  const state = new URL(authorizeUrl).searchParams.get('state');

  const res = await realFetch(
    `${base}/api/v1/integrations/msk/callback?code=abc&state=${state}`,
    { redirect: 'manual' },
  );
  assert.equal(res.status, 302);
  const location = res.headers.get('location');
  assert.equal(location, 'https://app.myelotrack.local/?connected=msk');
});
