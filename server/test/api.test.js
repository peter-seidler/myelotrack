import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repositories/memory/store.js';

let server;
let base;
let repo;

before(async () => {
  repo = createMemoryRepository();
  const app = createApp(repo);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

const get = (path) => fetch(`${base}${path}`);
const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('GET /healthz reports the backend', async () => {
  const res = await get('/healthz');
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'ok');
  assert.equal(json.backend, 'memory');
});

test('GET /api/v1/labs?analyte=hemoglobin returns a source-tagged series', async () => {
  const res = await get('/api/v1/labs?analyte=hemoglobin');
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.ok(data.length >= 2);
  assert.ok(data.every((r) => r.analyte === 'hemoglobin'));
  // Sorted ascending by collection time.
  const times = data.map((r) => new Date(r.collectedAt).getTime());
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  // Aggregated across more than one care team.
  assert.ok(new Set(data.map((r) => r.source)).size >= 2);
});

test('GET /api/v1/labs?source= filters by care team', async () => {
  const { data } = await (await get('/api/v1/labs?source=capital-health')).json();
  assert.ok(data.length > 0);
  assert.ok(data.every((r) => r.source === 'capital-health'));
});

test('GET /api/v1/labs/analytes lists distinct analytes', async () => {
  const { data } = await (await get('/api/v1/labs/analytes')).json();
  assert.ok(data.includes('hemoglobin'));
  assert.ok(data.includes('platelets'));
});

test('GET /api/v1/medications returns the active regimen', async () => {
  const { data } = await (await get('/api/v1/medications')).json();
  assert.ok(data.some((m) => m.name === 'Ruxolitinib'));
});

test('POST /api/v1/symptoms computes the total and persists', async () => {
  const res = await post('/api/v1/symptoms', {
    items: { fatigue: 5, nightSweats: 6, bonePain: 4 },
    weightKg: 71.0,
  });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(data.total, 15);
});

test('POST /api/v1/symptoms rejects a missing items payload', async () => {
  const res = await post('/api/v1/symptoms', { weightKg: 70 });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, 'bad_request');
});

test('POST /api/v1/medications/:id/doses logs a dose', async () => {
  const res = await post('/api/v1/medications/m1/doses', { status: 'taken' });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(data.medicationId, 'm1');
  assert.equal(data.status, 'taken');
});

test('POST /api/v1/medications/:id/doses rejects an unknown medication', async () => {
  const res = await post('/api/v1/medications/nope/doses', { status: 'taken' });
  assert.equal(res.status, 400);
});

test('POST /api/v1/pallor validates the score range', async () => {
  const ok = await post('/api/v1/pallor', { pallorScore: 0.4, eye: 'right' });
  assert.equal(ok.status, 201);
  const bad = await post('/api/v1/pallor', { pallorScore: 5 });
  assert.equal(bad.status, 400);
});

test('POST /api/v1/integrations/:source/sync touches the connection', async () => {
  const res = await post('/api/v1/integrations/msk/sync', {});
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.source, 'msk');
  assert.equal(data.status, 'connected');
});

test('unknown routes 404 as JSON', async () => {
  const res = await get('/api/v1/nope');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});

test('PHI requests are written to the audit log', async () => {
  await get('/api/v1/labs?analyte=platelets');
  const log = await repo.getAuditLog();
  assert.ok(log.length > 0);
  assert.ok(log.every((e) => e.route && e.action && e.at));
});
