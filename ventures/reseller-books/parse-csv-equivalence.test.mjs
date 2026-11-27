// The engines' parseCsv copies plain characters a run at a time (perf pass
// 2026-11-27, docs/history/reseller-books-perf-2026-11-27-csv-slices.md).
// This pins it to the character-at-a-time parser it replaced: same cells,
// same row count and the same non-enumerable `line` on every row, over
// seeded random text full of quotes, doubled quotes, CR, LF, CRLF, BOMs,
// blank lines and both delimiters.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as ebay from "./engines/ebay.mjs";
import * as etsy from "./engines/etsy.mjs";
import * as shopify from "./engines/shopify.mjs";
import * as poshmark from "./engines/poshmark.mjs";
import * as whatnot from "./engines/whatnot.mjs";

function reference(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false, line = 1, start = 1;
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else { field += c; if (c === "\n" || (c === "\r" && src[i + 1] !== "\n")) line++; }
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(Object.defineProperty(row, "line", { value: start }));
      row = []; start = ++line;
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(Object.defineProperty(row, "line", { value: start }));
  return rows;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const PIECES = ['"', '""', ",", ";", "\t", "\n", "\r", "\r\n", " ", "a", "12.50", "x y", "\uFEFF", "é", "", "Order ID"];

function sample(r) {
  let t = r() < 0.2 ? "\uFEFF" : "";
  const n = Math.floor(r() * 40);
  for (let i = 0; i < n; i++) t += PIECES[Math.floor(r() * PIECES.length)];
  return t;
}

function same(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assert.deepEqual(actual.map((row) => row.line), expected.map((row) => row.line), `${label}: line`);
  for (const row of actual) assert.equal(Object.keys(row).includes("line"), false, `${label}: line stays non-enumerable`);
}

test("every engine's parseCsv matches the character-at-a-time parser", () => {
  const r = rng(20261127);
  const inputs = [null, undefined, "", "a", '"', '""', '"a""b"c,d', 'x"y,z"w\n', "\r", "\r\n\r\n", "a,b\r\n\r\nc,d\r", 42];
  for (let i = 0; i < 4000; i++) inputs.push(sample(r));
  for (const text of inputs) {
    const label = JSON.stringify(text);
    for (const [name, mod] of [["ebay", ebay], ["etsy", etsy], ["shopify", shopify]]) same(mod.parseCsv(text), reference(text), `${name} ${label}`);
    for (const [name, mod] of [["poshmark", poshmark], ["whatnot", whatnot]]) {
      for (const delim of [",", ";", "\t"]) same(mod.parseCsv(text, delim), reference(text, delim), `${name} ${JSON.stringify(delim)} ${label}`);
    }
  }
});

// parseNumber (Poshmark and Whatnot engines) reads a plain "12.50" or, in a
// decimal-comma file, "12,50" directly; everything else takes the old path.
function referenceNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /\([^()]*\d[^()]*\)/.test(s) || /^[^0-9]*[-−–—]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

test("parseNumber's plain-amount shortcut gives the general path's number", () => {
  const r = rng(1127);
  const bits = ["1", "0", "9", "12", ".", ",", "-", "(", ")", " ", "$", "€", "5", "00", "e", "–"];
  const inputs = [null, undefined, "", "0", "007", "12.50", "12,50", "1.234,56", "1,234.56", "12.", ".5", ",5", "1e3", "9".repeat(400), "9".repeat(400) + ".5", 3.25, 0];
  for (let i = 0; i < 4000; i++) {
    let t = "";
    const n = 1 + Math.floor(r() * 8);
    for (let j = 0; j < n; j++) t += bits[Math.floor(r() * bits.length)];
    inputs.push(t);
  }
  for (const v of inputs) {
    for (const dc of [false, true]) {
      const want = referenceNumber(v, dc);
      for (const [name, mod] of [["poshmark", poshmark], ["whatnot", whatnot]]) {
        assert.ok(Object.is(mod.parseNumber(v, dc), want), `${name} ${JSON.stringify(v)} decimalComma=${dc}: ${mod.parseNumber(v, dc)} vs ${want}`);
      }
    }
  }
});
