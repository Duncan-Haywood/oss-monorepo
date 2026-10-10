import { test } from "node:test";
import assert from "node:assert/strict";
import { boardFeet, parseLogs, appraise, check, sampleLogs, samplePrices, money, toCsv } from "./calc.mjs";

test("Doyle matches the published table values", () => {
  assert.equal(boardFeet("doyle", 16, 16), 144);
  assert.equal(boardFeet("doyle", 10, 16), 36);
  assert.equal(boardFeet("doyle", 4, 16), 0);
  assert.equal(boardFeet("doyle", 20, 8), 128);
});

test("International 1/4 lands on the published 16-inch, 16-foot value", () => {
  assert.ok(Math.abs(boardFeet("international", 16, 16) - 180) < 3);
  assert.ok(Math.abs(boardFeet("international", 10, 16) - 65) < 4);
});

test("Doyle undercounts small logs relative to International, and the gap closes with size", () => {
  const gap = (d) => 1 - boardFeet("doyle", d, 16) / boardFeet("international", d, 16);
  assert.ok(gap(10) > 0.4);
  assert.ok(gap(10) > gap(16));
  assert.ok(gap(16) > gap(24));
});

test("partial-section lengths scale and unknown rules throw", () => {
  assert.ok(boardFeet("international", 14, 10) < boardFeet("international", 14, 12));
  assert.throws(() => boardFeet("bogus", 10, 10), /unknown log rule/);
});

test("parseLogs reads CSV/TSV, skips bad lines and says so", () => {
  const p = parseLogs("species\tdiameter\tlength\tcount\nOak\t16\t16\t3\nbad,x,1,1\nash,12,16,2.5\n");
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].species, "oak");
  assert.equal(p.warnings.length, 2);
  assert.match(parseLogs("nothing here").error, /No readable/);
});

test("appraise sums species and reports missing prices instead of guessing", () => {
  const { rows } = parseLogs("oak,16,16,10\nash,16,16,10");
  const a = appraise(rows, { oak: 500 }, "doyle");
  assert.equal(a.totalBf, 2880);
  assert.equal(a.totalValue, 720);
  assert.deepEqual(a.missingPrice, ["ash"]);
});

test("check: a Doyle lump-sum offer on small logs is flagged low and explains the rule gap", () => {
  const { rows } = parseLogs(sampleLogs());
  const base = check({ rows, prices: samplePrices(), offer: { kind: "lump", amount: 1000 } });
  assert.equal(base.belowThreshold, true);
  assert.match(base.advice.join(" "), /undercounts small logs/);
  assert.ok(base.rules[2].totalBf > base.rules[0].totalBf);
  const fair = check({ rows, prices: samplePrices(), offer: { kind: "lump", amount: base.fairValue } });
  assert.equal(fair.belowThreshold, false);
  assert.equal(fair.ratio, 1);
});

test("check: a per-MBF offer is converted using the offer's own rule", () => {
  const { rows } = parseLogs("oak,16,16,10");
  const r = check({ rows, prices: { oak: 500 }, offer: { kind: "perMbf", amount: 300 }, offerRule: "doyle" });
  assert.equal(r.offered, Math.round(1.44 * 300));
  assert.equal(r.impliedPerMbf, 300);
});

test("forester break-even uplift is fee/(1-fee)", () => {
  const { rows } = parseLogs("oak,16,16,10");
  assert.equal(check({ rows, prices: { oak: 500 }, offer: { kind: "lump", amount: 1000 }, foresterFeePct: 10 }).breakEvenUpliftPct, 11.11);
});

test("validation", () => {
  const { rows } = parseLogs("oak,16,16,10");
  assert.match(check({ rows, offer: { kind: "lump", amount: 0 } }).error, /offer/);
  assert.match(check({ rows: [], offer: { kind: "lump", amount: 5 } }).error, /log row/);
  assert.match(check({ rows, offer: { kind: "lump", amount: 5 }, foresterFeePct: 60 }).error, /Forester/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.match(toCsv(check({ rows, prices: { oak: 1 }, offer: { kind: "lump", amount: 5 } })), /oak,10,/);
});
