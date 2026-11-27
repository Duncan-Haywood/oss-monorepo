import { test } from "node:test";
import assert from "node:assert/strict";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";

// Property test for the licence check that unlocks the branded bid package:
// whatever is typed or answered, it never throws, only an explicit valid:true
// on a live key unlocks, and nothing but a plain https URL or a short ASCII
// token ever reaches the network.
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
  for (const k of ["valid", "license_key", "status", "error", "meta"]) if (r() < 0.6) o[k] = junk(r, depth + 1);
  return o;
}

test("interpret never throws and unlocks only on valid:true with a live key", () => {
  const r = rng(11);
  for (let i = 0; i < 3000; i++) {
    const j = junk(r);
    const v = interpret(j);
    assert.equal(typeof v.valid, "boolean");
    assert.equal(typeof v.reason, "string");
    if (v.valid) {
      assert.equal(j.valid, true);
      const s = j.license_key && j.license_key.status;
      assert.ok(s !== "expired" && s !== "disabled");
    }
    assert.ok(v.reason.length <= 120);
  }
});

test("cleanKey and buyLink never throw and only pass safe shapes", () => {
  const r = rng(12);
  const urls = ["https://api.example.com/v1/licenses/validate", "http://x.test", "javascript:alert(1)", "https://u:p@x.test/", "ftp://x", "//x", "", "not a url", "https://x.test/a b"];
  for (let i = 0; i < 3000; i++) {
    const k = cleanKey(junk(r));
    if (k !== null) assert.match(k, /^[A-Za-z0-9][A-Za-z0-9-]{7,99}$/);
    const u = buyLink(r() < 0.5 ? pick(r, urls) : junk(r));
    if (u !== null) {
      const p = new URL(u);
      assert.equal(p.protocol, "https:");
      assert.equal(p.username + p.password, "");
    }
  }
});

test("checkLicence never throws and sends only a clean key to an https URL", async () => {
  const r = rng(13);
  const urls = ["https://api.example.com/validate", "http://x.test", "javascript:alert(1)", "", undefined];
  for (let i = 0; i < 500; i++) {
    const sent = [];
    const mode = pick(r, ["ok", "throw", "badjson"]);
    const f = async (url, init) => {
      sent.push({ url, init });
      if (mode === "throw") throw new Error("offline");
      return { json: async () => { if (mode === "badjson") throw new Error("bad"); return junk(r); } };
    };
    const key = r() < 0.5 ? "ABCD-1234-EFGH" : junk(r);
    const v = await checkLicence(key, { fetch: f, url: pick(r, urls) });
    assert.equal(typeof v.valid, "boolean");
    assert.equal(typeof v.reason, "string");
    for (const s of sent) {
      assert.match(s.url, /^https:\/\//);
      assert.equal(s.init.method, "POST");
      assert.match(s.init.body, /^license_key=[A-Za-z0-9%-]+$/);
    }
    if (mode !== "ok") assert.equal(v.valid, false);
  }
});
