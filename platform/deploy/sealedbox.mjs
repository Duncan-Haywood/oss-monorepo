// libsodium-compatible crypto_box_seal, in the browser and in Node.
//
// GitHub's "create or update a secret" API wants the value encrypted with the
// repository's public key as a libsodium sealed box. This is that, built from
// tweetnacl + blake2b (both vendored, both unmodified) so the deploy page
// ships no WASM and no build step. sealedbox.test.mjs checks it against the
// real libsodium output.
//
//   sealed = ephemeral_pk (32) || box(msg, nonce, recipient_pk, ephemeral_sk)
//   nonce  = blake2b(ephemeral_pk || recipient_pk, outlen = 24)

import nacl from './vendor/nacl-fast.mjs';
import { blake2b } from './vendor/blake2b.mjs';

// tweetnacl looks for `self.crypto` or require('crypto'); neither exists in an
// ES module under Node, so hand it the Web Crypto both environments share.
nacl.setPRNG((x, n) => {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) x[i] = b[i];
  b.fill(0);
});

const NONCE_BYTES = 24;
const KEY_BYTES = 32;

const nonceFor = (epk, pk) => {
  const both = new Uint8Array(epk.length + pk.length);
  both.set(epk, 0);
  both.set(pk, epk.length);
  return blake2b(both, undefined, NONCE_BYTES);
};

/**
 * Seal `message` (Uint8Array) to `recipientPk` (32 bytes). `ephemeralSecret`
 * exists so tests can be deterministic; callers leave it out.
 */
export function seal(message, recipientPk, ephemeralSecret) {
  if (!(recipientPk instanceof Uint8Array) || recipientPk.length !== KEY_BYTES) {
    throw new Error('recipient public key must be 32 bytes');
  }
  const esk = ephemeralSecret ?? globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const { publicKey: epk, secretKey } = nacl.box.keyPair.fromSecretKey(esk);
  const boxed = nacl.box(message, nonceFor(epk, recipientPk), recipientPk, secretKey);
  const out = new Uint8Array(epk.length + boxed.length);
  out.set(epk, 0);
  out.set(boxed, epk.length);
  secretKey.fill(0);
  return out;
}

/** Inverse of seal(); returns null when the box does not open. */
export function open(sealed, recipientPk, recipientSk) {
  if (sealed.length < KEY_BYTES) return null;
  const epk = sealed.slice(0, KEY_BYTES);
  return nacl.box.open(sealed.slice(KEY_BYTES), nonceFor(epk, recipientPk), epk, recipientSk);
}

export const toBase64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
export const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** What the GitHub secrets API takes: base64 public key in, base64 sealed value out. */
export function sealSecretForGitHub(value, publicKeyBase64) {
  return toBase64(seal(new TextEncoder().encode(value), fromBase64(publicKeyBase64)));
}
