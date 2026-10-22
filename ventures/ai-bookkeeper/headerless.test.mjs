import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const f = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("CBA-style CSV with no header: day-first dates, signed amounts, balance chain", () => {
  const r = readStatement(f("cba-no-header.csv"));
  assert.equal(r.bank, "cba");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-03", -4520], ["2026-03-04", 250000], ["2026-03-05", -1299]]);
  assert.equal(r.rows[0].desc, "WOOLWORTHS 1234 SYDNEY");
  assert.equal(r.rows[2].balance, 444181);
  assert.equal(r.problems.length, 0);
  assert.deepEqual(checkRunningBalance(r.rows)?.breaks ?? [], []);
});

test("TD-style CSV with no header: withdrawals and deposits columns", () => {
  const r = readStatement(f("td-no-header.csv"));
  assert.equal(r.bank, "td");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-03", -485], ["2026-03-04", 180000], ["2026-03-05", -12040]]);
  assert.equal(r.rows[1].balance, 279515);
});

test("a three-column file (ANZ style, no balance) is read", () => {
  const r = readStatement("03/03/2026,-45.20,COFFEE\n04/03/2026,100.00,REFUND\n");
  assert.equal(r.bank, "anz");
  assert.equal(r.rows[1].date, "2026-03-04");
});
