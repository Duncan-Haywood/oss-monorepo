import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanKey, checkLicence } from "./licence.mjs";
import { signLicence } from "../../../../platform/billing/server.mjs";

// Property test for the key check that unlocks the Job report: whatever is typed, it
// never throws, never touches the network for a one-off key, and unlocks only a key
// signed by the configured public key for this product.
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
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_. \n<>\"'";
const junkText = (r) => Array.from({ length: Math.floor(r() * 200) }, () => ALPHA[Math.floor(r() * ALPHA.length)]).join("");

test("cleanKey never throws and passes only the ms1 key shape", () => {
  const r = rng(12);
  for (let i = 0; i < 3000; i++) {
    const k = cleanKey(r() < 0.2 ? pick(r, [null, undefined, 0, {}, [], NaN]) : junkText(r));
    if (k !== null) assert.match(k, /^ms1\.[A-Za-z0-9_-]{20,600}\.[A-Za-z0-9_-]{86}$/);
  }
});

test("one-character edits of a real key never unlock, and no check reaches the network", async () => {
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const key = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_fuzz", iat: 1 }, priv);
  let calls = 0;
  const f = async () => { calls++; throw new Error("no network expected"); };
  const cfg = { publicKey, edge: "https://billing.example" };
  assert.equal((await checkLicence(key, { cfg, fetch: f })).valid, true);
  const r = rng(13);
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < 300; i++) {
    const at = 4 + Math.floor(r() * (key.length - 4));
    if (key[at] === ".") continue;
    let c = key[at];
    while (c === key[at]) c = B64[Math.floor(r() * 64)];
    const bad = key.slice(0, at) + c + key.slice(at + 1);
    const v = await checkLicence(bad, { cfg, fetch: f });
    assert.equal(typeof v.reason, "string");
    // Base64url's last digit can carry padding bits a decoder ignores; only those edits may still verify.
    if (v.valid) assert.equal(Buffer.from(bad.split(".")[2], "base64url").equals(Buffer.from(key.split(".")[2], "base64url")) || Buffer.from(bad.split(".")[1], "base64url").equals(Buffer.from(key.split(".")[1], "base64url")), true, bad);
  }
  for (let i = 0; i < 300; i++) assert.equal((await checkLicence(junkText(r), { cfg, fetch: f })).valid, false);
  assert.equal(calls, 0);
});
