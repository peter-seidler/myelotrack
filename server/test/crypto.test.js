import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSecret,
  decryptSecret,
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
