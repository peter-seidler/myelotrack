import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSecret,
  decryptSecret,
  encryptBuffer,
  decryptBuffer,
  parseKey,
  generateKey,
} from '../src/lib/crypto.js';

const key = parseKey(generateKey());

test('encrypt/decrypt round-trips', () => {
  const secret = 'refresh-token-abc.123_XYZ';
  const enc = encryptSecret(secret, key);
  assert.notEqual(enc, secret);
  assert.match(enc, /^v1:/);
  assert.equal(decryptSecret(enc, key), secret);
});

test('a different key cannot decrypt', () => {
  const enc = encryptSecret('top-secret', key);
  const otherKey = parseKey(generateKey());
  assert.throws(() => decryptSecret(enc, otherKey));
});

test('tampered ciphertext is rejected (auth tag)', () => {
  const enc = encryptSecret('top-secret', key);
  const parts = enc.split(':');
  const ctBuf = Buffer.from(parts[3], 'base64');
  ctBuf[0] ^= 0xff; // flip a bit
  parts[3] = ctBuf.toString('base64');
  assert.throws(() => decryptSecret(parts.join(':'), key));
});

test('parseKey rejects wrong-length keys', () => {
  assert.throws(() => parseKey(Buffer.from('too-short').toString('base64')));
  assert.throws(() => parseKey(''));
});

test('encryptBuffer/decryptBuffer round-trips binary data', () => {
  const bytes = Buffer.from([0, 1, 2, 253, 254, 255, 42, 7]);
  const enc = encryptBuffer(bytes, key);
  assert.ok(Buffer.isBuffer(enc));
  assert.notDeepEqual(enc, bytes);
  assert.deepEqual(decryptBuffer(enc, key), bytes);
});

test('decryptBuffer rejects a tampered blob', () => {
  const enc = encryptBuffer(Buffer.from('image-bytes'), key);
  enc[enc.length - 1] ^= 0xff;
  assert.throws(() => decryptBuffer(enc, key));
});
