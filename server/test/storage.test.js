import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage } from '../src/storage/index.js';
import { generateKey } from '../src/lib/crypto.js';

const fieldEncryptionKey = generateKey();
const payload = Buffer.from('fake-jpeg-bytes-\x00\xff\x01', 'binary');

test('memory storage put/get round-trips and reports a digest', async () => {
  const store = createStorage({ backend: 'memory', fieldEncryptionKey });
  const meta = await store.put('u/2026/x.jpg', payload);
  assert.equal(meta.bytes, payload.length);
  assert.match(meta.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await store.get('u/2026/x.jpg'), payload);
  assert.equal(await store.get('missing'), null);
});

test('local storage encrypts on disk and decrypts on read', async () => {
  const dir = join(tmpdir(), `mt-storage-test-${process.pid}`);
  const store = createStorage({ backend: 'local', dir, fieldEncryptionKey });
  const key = 'u/2026/eye.png';
  await store.put(key, payload);

  // Raw file on disk must NOT be the plaintext.
  const onDisk = await readFile(join(dir, key));
  assert.notDeepEqual(onDisk, payload);
  assert.ok(onDisk.length > payload.length); // iv + tag overhead

  assert.deepEqual(await store.get(key), payload);
  await rm(dir, { recursive: true, force: true });
});

test('createStorage requires an encryption key', () => {
  assert.throws(() => createStorage({ backend: 'memory', fieldEncryptionKey: '' }));
});
