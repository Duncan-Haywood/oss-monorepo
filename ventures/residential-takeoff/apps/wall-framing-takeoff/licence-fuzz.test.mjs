import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanKey, checkLicence } from "./licence.mjs";
import { signLicence } from "../../../../platform/billing/server.mjs";

// Property test for the licence check that unlocks the Job report: whatever is typed,
// it never throws, never unlocks unless the key is signed for this product by the
// configured public key, and makes no network call for a one-off key.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_. \n<>\"'é";
function junk(r) {
  const leaves = [null, undefined, 0, 1, NaN, true, "", "ms1.", "ms1..", [], {}, "x".repeat(900)];
  if (r() < 0.3) return pick(r, leaves);
  let s = r() < 0.5 ? "ms1." : "";
  const n = Math.floor(r() * 200);
  for (let i = 0; i < n; i++) s += ALPHA[Math.floor(r() * ALPHA.length)];
  return s;
}

test("cleanKey never throws and passes only the ms1.<payload>.<signature> shape", () => {
  const r = rng(12);
  for (let i = 0; i < 3000; i++) {
    const k = cleanKey(junk(r));
    if (k !== null) assert.match(k, /^ms1\.[A-Za-z0-9_-]{20,600}\.[A-Za-z0-9_-]{86}$/);
  }
});

test("checkLicence never throws, never calls the network, and unlocks only a real key for this product", async () => {
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const good = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_fuzz", iat: 1_800_000_000 }, priv);
  const r = rng(13);
  let calls = 0;
  const f = async () => { calls++; throw new Error("no network expected"); };
  for (let i = 0; i < 400; i++) {
    // A real key with one character flipped, or junk.
    let key = junk(r);
    if (r() < 0.4) {
      const at = 4 + Math.floor(r() * (good.length - 4));
      const c = good[at] === "A" ? "B" : "A";
      key = good.slice(0, at) + c + good.slice(at + 1);
    }
    const v = await checkLicence(/** @type {any} */ (key), { cfg: { publicKey, edge: "https://billing.example" }, fetch: f });
    assert.equal(typeof v.valid, "boolean");
    assert.equal(typeof v.reason, "string");
    if (v.valid) assert.equal(cleanKey(key), good, "only the real key unlocks");
  }
  assert.equal((await checkLicence(good, { cfg: { publicKey }, fetch: f })).valid, true);
  assert.equal(calls, 0);
});
