// Seeded robustness fuzz for the .xlsx (zip) reader and the MT940 / camt.053 readers (made-up
// damage to the committed fixtures; no outside data). Invariant: each reader returns its result or
// throws an Error with a message, and never leaks a TypeError or RangeError from reading past the end.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { xlsxToCsv } from "./xlsx.mjs";
import { readMt940, readCamt } from "./sepa.mjs";

const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const bytes = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const text = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

const tame = (e, tag) => {
  if (e instanceof assert.AssertionError) throw e;
  assert.ok(e instanceof Error && e.message.length > 0, `${tag}: ${e}`);
  assert.ok(!(e instanceof TypeError) && !(e instanceof RangeError), `${tag}: leaked ${e.name}: ${e.message}`);
};

test("a damaged .xlsx is read or refused with an Error", async () => {
  const r = rng(20261103), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let ok = 0, refused = 0;
  for (const name of ["generic-statement.xlsx", "otp-hu.xlsx"]) {
    const src = bytes(name);
    for (let i = 0; i < 120; i++) {
      let b = src.slice();
      const mode = pick(0, 2);
      if (mode === 0) for (let k = pick(1, 10); k > 0; k--) b[pick(0, b.length - 1)] = pick(0, 255);
      else if (mode === 1) b = b.subarray(0, pick(0, b.length));
      else { const at = pick(0, b.length - 8); b.fill(r() < 0.5 ? 0 : 255, at, at + pick(1, 8)); }
      try { assert.equal(typeof await xlsxToCsv(b), "string"); ok++; } catch (e) { tame(e, `${name} #${i} mode ${mode}`); refused++; }
    }
  }
  assert.equal(ok + refused, 240);
});

const mutateText = (s, r) => {
  const pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const mode = pick(0, 3);
  if (mode === 0) return s.slice(0, pick(0, s.length));
  if (mode === 1) { const a = pick(0, s.length - 1); return s.slice(0, a) + s.slice(a + pick(1, 40)); }
  if (mode === 2) { const a = pick(0, s.length - 1); return s.slice(0, a) + ["", "\u0000", "99999999999999999999", ":61:", "<Ntry>", "-", ",,", "‮"][pick(0, 7)] + s.slice(a); }
  return s.split("\n").filter(() => r() < 0.85).join("\n");
};

test("damaged MT940 and camt.053 files are read or refused with an Error", () => {
  const r = rng(11032026);
  for (const [name, read] of [["checking.mt940", readMt940], ["checking.camt053.xml", readCamt]]) {
    const src = text(name);
    for (let i = 0; i < 200; i++) {
      try { read(mutateText(src, r)); } catch (e) { tame(e, `${name} #${i}`); }
    }
  }
});
