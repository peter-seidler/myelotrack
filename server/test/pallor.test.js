// Configure encryption + an in-memory image store before config is read.
process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.STORAGE_BACKEND = 'memory';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

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

// A minimal valid-enough PNG byte sequence (header + a few bytes).
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

test('POST /pallor with an image encrypts, stores, and serves it back', async () => {
  const form = new FormData();
  form.append('image', new Blob([pngBytes], { type: 'image/png' }), 'eye.png');
  form.append('pallorScore', '0.4');
  form.append('eye', 'right');

  const res = await fetch(`${base}/api/v1/pallor`, { method: 'POST', body: form });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(data.pallorScore, 0.4);
  assert.equal(data.storage.contentType, 'image/png');
  assert.equal(data.storage.bytes, pngBytes.length);
  assert.match(data.storage.sha256, /^[0-9a-f]{64}$/);
  assert.ok(data.storage.key.startsWith('u/'));

  // Fetch the image back — decrypted, correct type, byte-identical.
  const imgRes = await fetch(`${base}/api/v1/pallor/${data._id}/image`);
  assert.equal(imgRes.status, 200);
  assert.equal(imgRes.headers.get('content-type'), 'image/png');
  const roundTripped = Buffer.from(await imgRes.arrayBuffer());
  assert.deepEqual(roundTripped, pngBytes);
});

test('POST /pallor with JSON only (no image) still records metadata', async () => {
  const res = await fetch(`${base}/api/v1/pallor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pallorScore: 0.33, eye: 'left' }),
  });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(data.pallorScore, 0.33);
  assert.equal(data.storage, null);
});

test('POST /pallor rejects a non-image upload', async () => {
  const form = new FormData();
  form.append('image', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'x.txt');
  const res = await fetch(`${base}/api/v1/pallor`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
});

test('GET image for a reading without one 400s', async () => {
  const created = await (
    await fetch(`${base}/api/v1/pallor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pallorScore: 0.5 }),
    })
  ).json();
  const res = await fetch(`${base}/api/v1/pallor/${created.data._id}/image`);
  assert.equal(res.status, 400);
});
