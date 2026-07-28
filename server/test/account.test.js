import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/repositories/memory/store.js';

let server;
let base;
let repo;
let deletedKeys;

before(async () => {
  repo = createMemoryRepository();
  // A pallor photo backed by an object-storage blob, so we can assert erasure
  // purges the blob as well as the record.
  repo.addPallorPhoto({
    eye: 'right',
    pallorScore: 0.4,
    storage: { bucket: 'test', key: 'pallor/abc.enc' },
  });
  // Stub storage that records which blob keys were deleted.
  deletedKeys = [];
  const storage = {
    backend: 'stub',
    bucket: 'test',
    async put() {},
    async get() {
      return null;
    },
    async delete(key) {
      deletedKeys.push(key);
    },
  };
  const app = createApp(repo, { storage });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

const get = (path) => fetch(`${base}${path}`);
const del = (path) => fetch(`${base}${path}`, { method: 'DELETE' });

test('GET /api/v1/account/export returns a self-contained document', async () => {
  const res = await get('/api/v1/account/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') || '', /attachment; filename=/);

  const body = await res.json();
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.app, 'MyeloTrack');
  assert.ok(body.generatedAt);

  const { records } = body;
  // The seed has real content to export.
  assert.ok(records.labResults.length > 0);
  assert.ok(records.medications.length > 0);
  assert.ok(records.pallor.length > 0);
  // Collections the export must carry.
  for (const key of [
    'symptoms',
    'medications',
    'doseLogs',
    'labResults',
    'pallor',
    'integrations',
  ]) {
    assert.ok(Array.isArray(records[key]), `records.${key} is an array`);
  }
});

test('export never leaks integration OAuth tokens', async () => {
  const { records } = await (await get('/api/v1/account/export')).json();
  for (const conn of records.integrations) {
    assert.equal(conn.tokens, undefined, 'no encrypted tokens in export');
  }
});

test('DELETE /api/v1/account erases all PHI and purges blobs', async () => {
  const res = await del('/api/v1/account');
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.ok(data.deleted.pallor >= 1);
  assert.ok(data.deleted.labResults > 0);

  // The pallor blob was purged from object storage.
  assert.deepEqual(deletedKeys, ['pallor/abc.enc']);

  // Everything is gone afterwards.
  const after = await (await get('/api/v1/account/export')).json();
  for (const key of Object.keys(after.records)) {
    assert.equal(after.records[key].length, 0, `records.${key} is empty after delete`);
  }
  const labs = await (await get('/api/v1/labs')).json();
  assert.equal(labs.data.length, 0);
});
