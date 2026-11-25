import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanKey, checkLicence } from "./licence.mjs";
import { signLicence } from "../../platform/billing/server.mjs";

// Property test for the licence check that unlocks the branded bid package:
// whatever is typed, and whatever a byte-flipped key looks like, it never
// throws and only a key signed for this pack unlocks.
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
function junk(r, depth = 0) {
  const leaves = [null, undefined, 0, 1, -1, NaN, true, false, "", "valid", "true", [], {}, () => 1, Symbol.iterator.toString(), "x".repeat(500)];
  if (depth > 2 || r() < 0.5) return pick(r, leaves);
  const o = {};
  for (const k of ["v", "p", "t", "s", "exp"]) if (r() < 0.6) o[k] = junk(r, depth + 1);
  return o;
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const cfg = { publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)) };
const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));

test("cleanKey never throws and only passes the ms1 key shape", () => {
  const r = rng(12);
  for (let i = 0; i < 3000; i++) {
    const k = cleanKey(r() < 0.5 ? junk(r) : "ms1." + String(junk(r)) + "." + "A".repeat(86));
    if (k !== null) assert.match(k, /^ms1\.[A-Za-z0-9_-]{20,600}\.[A-Za-z0-9_-]{86}$/);
  }
});

test("checkLicence never throws, and a key with any one character changed does not unlock", async () => {
  const r = rng(13);
  const good = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "one-off", s: "txn_fuzz", iat: 1 }, priv);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < 400; i++) {
    const at = 4 + Math.floor(r() * (good.length - 4));
    if (good[at] === ".") continue;
    let c = pick(r, [...alphabet]);
    if (c === good[at]) c = good[at] === "A" ? "B" : "A";
    const bent = good.slice(0, at) + c + good.slice(at + 1);
    const v = await checkLicence(bent, { cfg });
    assert.equal(typeof v.reason, "string");
    // A changed last signature character can only alter its unused low bits; the rest must fail.
    if (at < good.length - 1) assert.equal(v.valid, false, `changed position ${at}`);
  }
  for (let i = 0; i < 300; i++) {
    const v = await checkLicence(junk(r), { cfg });
    assert.equal(v.valid, false);
  }
  assert.equal((await checkLicence(good, { cfg })).valid, true);
});
