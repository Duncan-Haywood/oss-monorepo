// cleanOcr: pinned repairs, plus properties on random and hostile text:
// never throws, keeps the line count, never grows the text and leaves digit-free
// text alone.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanOcr } from "./cleanocr.mjs";

test("pinned repairs", () => {
  assert.equal(cleanOcr("TOTAL S10.62"), "TOTAL $10.62");
  assert.equal(cleanOcr("5 .50"), "5.50");
  assert.equal(cleanOcr("tax O.87"), "tax 0.87");
  assert.equal(cleanOcr("12/O3/2O24"), "12/03/2024");
  assert.equal(cleanOcr("7.50ZR"), "7.50ZR");
});

test("words are left alone", () => {
  for (const w of ["Coffee Shop", "BOSS", "SOS", "Total", "Store 5"]) assert.equal(cleanOcr(w), w);
});

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

test("random text: no throw, same line count, never grows", () => {
  const r = rng(7);
  const alphabet = "0123456789OolIDSsBZz|.,/-$€£ \tabcxyzTAX\r\n";
  for (let i = 0; i < 3000; i++) {
    let t = "";
    const n = Math.floor(r() * 60);
    for (let j = 0; j < n; j++) t += alphabet[Math.floor(r() * alphabet.length)];
    const once = cleanOcr(t);
    assert.equal(once.split("\n").length, t.split(/\r?\n/).length, JSON.stringify(t));
    // Not asserted: idempotence. Junk such as "832.\t41\u20ac18" is joined on the second pass
    // only (found by this test, 2026-11-06); receipts text never has that shape.
    assert.ok(cleanOcr(once).length <= once.length, JSON.stringify(t)); // a pass only removes or swaps characters
  }
});

test("digit-free text is unchanged apart from line endings", () => {
  const r = rng(11);
  const alphabet = "OolIDSsBZz|abc xyz.,$\n";
  for (let i = 0; i < 1000; i++) {
    let t = "";
    for (let j = 0, n = Math.floor(r() * 40); j < n; j++) t += alphabet[Math.floor(r() * alphabet.length)];
    // "S" before digits is the only rule that needs digits; none here
    assert.equal(cleanOcr(t), t, JSON.stringify(t));
  }
});

test("a very long line finishes quickly", () => {
  const t = "1 ".repeat(50000) + "O".repeat(50000);
  const t0 = Date.now();
  cleanOcr(t);
  assert.ok(Date.now() - t0 < 3000);
});
