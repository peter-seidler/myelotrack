// Enable passkey auth before config is read (own process).
process.env.AUTH_REQUIRED = 'true';
process.env.SESSION_SECRET = 'test-session-secret-please-change';
process.env.RP_ID = 'localhost';
process.env.RP_ORIGIN = 'http://localhost:5173';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, verifySession } from '../src/lib/session.js';

const SECRET = process.env.SESSION_SECRET;

// --- session unit tests (no server) ---
test('session issue/verify round-trips', () => {
  const token = issueSession('user_1', SECRET);
  assert.equal(verifySession(token, SECRET), 'user_1');
});

test('session rejects a wrong secret, tampering, and expiry', () => {
  const token = issueSession('user_1', SECRET);
  assert.equal(verifySession(token, 'other-secret'), null);
  assert.equal(verifySession(token.slice(0, -2) + 'xx', SECRET), null);
  const expired = issueSession('user_1', SECRET, -1); // already expired
  assert.equal(verifySession(expired, SECRET), null);
});

// --- HTTP: gating + WebAuthn options ---
let server;
let base;

before(async () => {
  const { createApp } = await import('../src/app.js');
  const { createMemoryRepository } = await import('../src/repositories/memory/store.js');
  const app = createApp(createMemoryRepository());
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('PHI routes are 401 without a session when auth is required', async () => {
  const res = await fetch(`${base}/api/v1/labs`);
  assert.equal(res.status, 401);
});

test('a valid session cookie unlocks PHI routes', async () => {
  const token = issueSession('user_1', SECRET);
  const res = await fetch(`${base}/api/v1/labs`, {
    headers: { cookie: `mt_session=${token}` },
  });
  assert.equal(res.status, 200);
});

test('a Bearer session token also works', async () => {
  const token = issueSession('user_1', SECRET);
  const res = await fetch(`${base}/api/v1/medications`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
});

test('GET /auth/me reports required + unauthenticated initially', async () => {
  const { data } = await (await fetch(`${base}/api/v1/auth/me`)).json();
  assert.equal(data.required, true);
  assert.equal(data.authenticated, false);
  assert.equal(data.hasCredentials, false);
});

test('registration options return a challenge and rp id', async () => {
  const { data } = await (await fetch(`${base}/api/v1/auth/registration/options`)).json();
  assert.ok(data.challenge);
  assert.equal(data.rp.id, 'localhost');
  assert.ok(data.user);
});

test('authentication options are issued', async () => {
  const { data } = await (
    await fetch(`${base}/api/v1/auth/authentication/options`)
  ).json();
  assert.ok(data.challenge);
});

test('registration verify rejects a bogus attestation', async () => {
  // Prime a challenge, then send garbage — verification must fail cleanly (400).
  await fetch(`${base}/api/v1/auth/registration/options`);
  const res = await fetch(`${base}/api/v1/auth/registration/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'x', response: {}, type: 'public-key' }),
  });
  assert.equal(res.status, 400);
});
