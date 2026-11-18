// Generated BAI2 files with a known answer. Each file is built from random
// credits and debits (type codes, funds types S/V/D/0, 88 continuations, several
// daily groups), so the expected rows are known before the reader runs. The
// reader must return those cents with the right signs and dates, the closing
// ledger balance of the last group, and never throw on truncated copies.
// Seeded and deterministic; FUZZ_SEED / FUZZ_ROUNDS explore further.
// Invented files only; not a bank's real download.
import test from "node:test";
import assert from "node:assert/strict";
import { readBai2, isBai2 } from "./bai2.mjs";

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const SEED = Number(process.env.FUZZ_SEED ?? 20261102), ROUNDS = Number(process.env.FUZZ_ROUNDS ?? 300);
const pick = (r, a) => a[Math.floor(r() * a.length)];
const yymmdd = (d) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);

function build(r) {
  const lines = ["01,0004,BANK,260105,0900,1,80,,2/"], expect = [];
  const groups = 1 + Math.floor(r() * 3);
  let statement = null;
  for (let g = 0; g < groups; g++) {
    const date = `2026-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
    const close = Math.floor(r() * 9_000_000);
    lines.push(`02,BANK,0004,1,${yymmdd(date)},2359,USD,2/`);
    lines.push(`03,0975312468,USD,010,${close},,,015,${close},,/`);
    if (!statement || date >= statement.date) statement = { cents: close, date };
    const n = Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const credit = r() < 0.5;
      const code = credit ? 100 + Math.floor(r() * 300) : 400 + Math.floor(r() * 300);
      const amt = 1 + Math.floor(r() * 5_000_000);
      const ft = pick(r, ["0", "S", "V", "D", ""]);
      let fund = ft, vdate = null;
      if (ft === "S") fund = "S,1,2,3";
      else if (ft === "V") { vdate = `2026-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`; fund = `V,${yymmdd(vdate)},0000`; }
      else if (ft === "D") fund = "D,2,100,1,200,2";
      const memo = `M${i}G${g}`;
      lines.push(`16,${code},${amt},${fund},BR${i},CR${i},${memo}${r() < 0.3 ? "" : "/"}`);
      expect.push({ cents: credit ? amt : -amt, date: vdate ?? date });
    }
    lines.push(`49,${close},${n + 2}/`);
  }
  lines.push("98,0,1,9/", "99,0,1,11/");
  return { text: lines.join(r() < 0.5 ? "\n" : "\r\n"), expect, statement, groups };
}

test("generated BAI2 files read back to the amounts, signs and dates they were built from", () => {
  const r = rng(SEED);
  let checked = 0;
  for (let k = 0; k < ROUNDS; k++) {
    const f = build(r);
    if (!f.expect.length) continue;
    assert.ok(isBai2(f.text));
    const out = readBai2(f.text);
    assert.deepEqual(out.rows.map((x) => ({ cents: x.cents, date: x.date })), f.expect, `round ${k}`);
    // the same account repeats each day, so it counts once and the closing balance is the latest group's
    assert.deepEqual(out.statement, f.statement, `statement, round ${k}`);
    checked++;
  }
  assert.ok(checked > ROUNDS / 2);
});

test("truncated and shuffled BAI2 files never throw and give integer cents", () => {
  const r = rng(SEED + 1);
  for (let k = 0; k < ROUNDS; k++) {
    let t = build(r).text;
    t = r() < 0.5 ? t.slice(0, Math.floor(r() * t.length)) : t.split(/\r?\n/).sort(() => r() - 0.5).join("\n");
    const out = readBai2(t);
    for (const x of out.rows) {
      assert.ok(Number.isInteger(x.cents) && x.cents !== 0);
      assert.match(x.date, /^\d{4}-\d\d-\d\d$/);
    }
  }
});
