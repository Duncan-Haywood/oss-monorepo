// Mutation fuzz of readStatement: every fixture, randomly corrupted, must either
// read or report problems. It must never throw, and every row it returns must
// carry integer cents and a string date. Deterministic (seeded) so a failure
// replays: set FUZZ_SEED / FUZZ_ROUNDS to explore further.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readStatement } from "./bank.mjs";

const dir = new URL("./fixtures/", import.meta.url);
const texts = readdirSync(dir).filter((f) => !/\.(xls|xlsx)$/.test(f))
  .map((f) => [f, readFileSync(new URL(f, dir), "utf8")]);

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const JUNK = ["", "\0", "\r", "\n", ",", ";", "\"", "-", "(", ")", "9".repeat(30), "1e999", "NaN", " ", "﻿", "€", "0000-00-00", "31/02/2020", ":61:", "<", "</STMTTRN>", "'"];

function mutate(t, r) {
  const n = 1 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const p = Math.floor(r() * (t.length + 1)), k = Math.floor(r() * 5);
    if (k === 0) t = t.slice(0, p) + t.slice(p + 1 + Math.floor(r() * 20));          // delete a span
    else if (k === 1) t = t.slice(0, p) + JUNK[Math.floor(r() * JUNK.length)] + t.slice(p); // insert junk
    else if (k === 2) t = t.slice(0, p);                                              // truncate
    else if (k === 3) { const q = Math.floor(r() * t.length); t = t.slice(0, p) + t.slice(q, q + 40) + t.slice(p); } // duplicate a span
    else t = t.split("\n").sort(() => r() - 0.5).join("\n");                          // shuffle lines
  }
  return t;
}

test("readStatement survives corrupted fixtures", () => {
  const seed = Number(process.env.FUZZ_SEED ?? 20261024), rounds = Number(process.env.FUZZ_ROUNDS ?? 40);
  const r = rng(seed);
  for (const [name, text] of texts) {
    for (let i = 0; i < rounds; i++) {
      const m = mutate(text, r);
      let out;
      try { out = readStatement(m); }
      catch (e) { assert.fail(`${name} round ${i} seed ${seed} threw: ${e.message}\n${JSON.stringify(m.slice(0, 300))}`); }
      for (const row of out.rows ?? []) {
        assert.ok(Number.isSafeInteger(row.cents), `${name} round ${i}: cents ${row.cents}`);
        assert.equal(typeof row.date, "string", `${name} round ${i}: date ${row.date}`);
      }
    }
  }
});

test("an MT940 amount too large for integer cents is skipped, not read as 3.7e+21", () => {
  const t = ":20:X\n:25:1/2\n:28C:1\n:60F:C260101EUR100,00\n:61:2601020102D" + "9".repeat(30) + ",00NTRFNONREF\n:86:big\n:62F:C260102EUR100,00\n";
  const r = readStatement(t);
  assert.equal(r.rows.length, 0);
  assert.ok(r.problems.some((p) => /unreadable/.test(p)));
});
