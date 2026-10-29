// Every bank fixture, cut, truncated, quote-injected and spliced with junk at seeded
// random places, must read or fail with a plain Error: never a TypeError, RangeError or
// ReferenceError from a code path that assumed a well-formed file. 11,100 mutations of the
// 85 fixtures were clean on 2026-10-29; this keeps 40 per file. Made-up and public fixtures only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readStatement } from "./bank.mjs";

const dir = new URL("./fixtures/", import.meta.url);

test("mutated bank fixtures never hit a programming error", () => {
  let seed = 1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const bad = [];
  let runs = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /\.(csv|txt|qif|ofx|tsv)$/i.test(x))) {
    const t = fs.readFileSync(new URL(f, dir), "utf8");
    if (t.length > 200000) continue;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(rnd() * t.length), b = a + Math.floor(rnd() * 40), k = Math.floor(rnd() * 4);
      const s = k === 0 ? t.slice(0, a) + t.slice(b) : k === 1 ? t.slice(0, a) : k === 2 ? t.slice(0, a) + '"' + t.slice(a) : t.slice(0, a) + "\u0000�,,;;" + t.slice(b);
      runs++;
      try { JSON.stringify(readStatement(s)); }
      catch (e) { if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) bad.push(`${f}#${i}: ${e.message}`); }
    }
  }
  assert.ok(runs > 1000);
  assert.deepEqual(bad.slice(0, 5), []);
});
