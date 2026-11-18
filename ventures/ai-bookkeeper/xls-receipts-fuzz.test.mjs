// Seeded robustness fuzz for the legacy .xls reader and the receipt parser (made-up damage to
// two LibreOffice fixtures and invented receipt text; no outside data). Invariants: the .xls reader
// returns a string or throws an Error with a message (never hangs, never a TypeError from
// reading past the end); parseReceipt/addReceipts never throw on hostile text, amounts are
// safe integers, and a kept receipt always has a date, merchant and positive total.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { xlsToCsv } from "./xls.mjs";
import { parseReceipt, addReceipts, splitReceipts } from "./receipts.mjs";
import { newBooks } from "./engine.mjs";

const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
// The distinct field counts of a CSV's lines, quotes respected, in one pass: every row of the
// reader's CSV is padded to the sheet's width, so a good read has exactly one.
const rowWidths = (csv) => {
  const out = new Set();
  for (let i = 0, n = 1, q = false; i < csv.length; i++) {
    const c = csv.charCodeAt(i);
    if (c === 34) q = !q;
    else if (!q && c === 44) n++;
    else if (!q && c === 10) { out.add(n); n = 1; }
  }
  return out;
};
const rd = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test("a damaged .xls is read or refused with an Error, never a crash of another kind", () => {
  const r = rng(20261102), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let ok = 0, refused = 0;
  for (const name of ["generic-statement.xls", "long-statement.xls"]) {
    const src = rd(name);
    for (let i = 0; i < 150; i++) {
      const b = src.slice();
      const mode = pick(0, 3);
      let bytes = b;
      if (mode === 0) for (let k = pick(1, 12); k > 0; k--) b[pick(0, b.length - 1)] = pick(0, 255);
      else if (mode === 1) bytes = b.subarray(0, pick(0, b.length));
      else if (mode === 2) { const at = pick(512, b.length - 64), n = pick(1, 64); b.fill(r() < 0.5 ? 0 : 255, at, at + n); }
      else for (let k = pick(1, 4); k > 0; k--) { const at = pick(0, b.length - 5); b[at] = 0xff; b[at + 1] = 0xff; b[at + 2] = 0xff; b[at + 3] = 0xff; }
      let csv;
      try { csv = xlsToCsv(bytes); assert.equal(typeof csv, "string"); }
      catch (e) {
        if (e instanceof assert.AssertionError) throw e;
        assert.ok(e instanceof Error && typeof e.message === "string" && e.message.length > 0, `${name} #${i} mode ${mode}: ${e}`);
        assert.ok(!(e instanceof TypeError) && !(e instanceof RangeError), `${name} #${i} mode ${mode}: leaked ${e.name}: ${e.message}`);
        refused++;
        continue;
      }
      // one width for every row (rows are padded with commas past their last cell)
      const widths = rowWidths(csv);
      assert.ok(widths.size === 1, `${name} #${i} mode ${mode}: rows of ${[...widths].join(", ")} fields`);
      ok++;
    }
  }
  assert.ok(ok + refused === 300);
});

const WORDS = ["TOTAL", "Subtotal", "Tax", "Tip", "Cash", "VISA", "Thank you", "Café Müller", "BLUE BOTTLE", "12/31/2026", "2026-02-30", "01.02.26", "31/12/2025", "$12.50", "12,50 €", "1.234,56", "¥1200", "-4.00", "0.00", "99999999999999999999.99", "1e21", "NaN", "Infinity", "(3.20)", "x2 @ 1.10", "\u0000", "‮", "<script>", "'; DROP", "___", "   "];
const junk = (r) => {
  const lines = [], n = 1 + Math.floor(r() * 14);
  for (let i = 0; i < n; i++) {
    const k = 1 + Math.floor(r() * 4);
    lines.push(Array.from({ length: k }, () => WORDS[Math.floor(r() * WORDS.length)]).join(r() < 0.5 ? " " : "  "));
  }
  return lines.join(r() < 0.1 ? "\r\n" : "\n");
};

test("receipt parsing survives hostile text and keeps only sane receipts", () => {
  const r = rng(11022026);
  let kept = 0;
  for (let i = 0; i < 400; i++) {
    const text = junk(r) + (r() < 0.3 ? "\n\n\n" + junk(r) : "");
    const tag = JSON.stringify(text);
    for (const blk of splitReceipts(text)) {
      const p = parseReceipt(blk);
      for (const k of ["cents", "taxCents", "tipCents"]) assert.ok(p[k] == null || Number.isSafeInteger(p[k]), `${k} ${p[k]} for ${tag}`);
      for (const it of p.items) assert.ok(Number.isSafeInteger(it.cents), "item cents " + tag);
    }
    const out = addReceipts(newBooks(), text);
    for (const x of out.added) {
      assert.ok(x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date), "date " + tag);
      assert.ok(x.merchant, "merchant " + tag);
      assert.ok(Number.isSafeInteger(x.cents) && x.cents > 0, "cents " + tag);
      kept++;
    }
    // adding the same text again keeps nothing new
    const again = addReceipts(out.books, text);
    assert.equal(again.added.length, 0, "second add duplicates " + tag);
  }
  assert.ok(kept >= 0);
});
