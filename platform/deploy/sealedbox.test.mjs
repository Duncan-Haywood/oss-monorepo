import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, sealSecretForGitHub, fromBase64 } from './sealedbox.mjs';
import nacl from './vendor/nacl-fast.mjs';

const enc = (s) => new TextEncoder().encode(s);

test('seal then open round-trips', () => {
  const kp = nacl.box.keyPair();
  const sealed = seal(enc('AKIA-example-secret'), kp.publicKey);
  assert.equal(sealed.length, 32 + 16 + 'AKIA-example-secret'.length);
  assert.equal(new TextDecoder().decode(open(sealed, kp.publicKey, kp.secretKey)), 'AKIA-example-secret');
});

test('a different key cannot open it, and each seal is different', () => {
  const a = nacl.box.keyPair();
  const b = nacl.box.keyPair();
  const s1 = seal(enc('x'), a.publicKey);
  assert.equal(open(s1, b.publicKey, b.secretKey), null);
  assert.notDeepEqual(seal(enc('x'), a.publicKey), s1);
});

test('rejects a malformed public key', () => {
  assert.throws(() => seal(enc('x'), new Uint8Array(5)), /32 bytes/);
});

test('sealSecretForGitHub emits base64 that opens with the matching key', () => {
  const kp = nacl.box.keyPair();
  const pkB64 = Buffer.from(kp.publicKey).toString('base64');
  const out = sealSecretForGitHub('hunter2', pkB64);
  assert.equal(new TextDecoder().decode(open(fromBase64(out), kp.publicKey, kp.secretKey)), 'hunter2');
});

// Interop: this value was produced by libsodium's crypto_box_seal
// (libsodium-wrappers 0.7.15) for the fixed key below. If our nonce
// derivation or layout drifted from libsodium's, GitHub would reject every
// secret this page uploads, and nothing else would notice.
const SK = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const LIBSODIUM_SEALED = 'GtmEjcHeXPGVTXZoBXKN2mcRXKeDImxOLwojrgPJvR3Rc+bdebbKeA8RTNi/w5sgyiiVLKzlRx3Ls9RnYsolf2jerpo=';
test('opens a sealed box produced by real libsodium', () => {
  const kp = nacl.box.keyPair.fromSecretKey(SK);
  const opened = open(fromBase64(LIBSODIUM_SEALED), kp.publicKey, kp.secretKey);
  assert.equal(new TextDecoder().decode(opened), 'libsodium says hello');
});

// The PRNG hook must fill every byte. Skipping index 0 leaves a fixed zero
// byte in every ephemeral key, and nothing else here would notice.
test('the PRNG hook fills the first byte too', () => {
  let nonzero = 0;
  for (let i = 0; i < 64; i++) if (nacl.randomBytes(32)[0] !== 0) nonzero++;
  assert.ok(nonzero > 0, 'byte 0 was zero in 64 draws');
});

test('open returns null, not a throw, for input too short to hold a sealed box', () => {
  const kp = nacl.box.keyPair();
  assert.equal(open(new Uint8Array(0), kp.publicKey, kp.secretKey), null);
  assert.equal(open(new Uint8Array(5), kp.publicKey, kp.secretKey), null);
});
