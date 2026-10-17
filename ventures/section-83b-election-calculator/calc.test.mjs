import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, taxes, valueAt, breakEvenMultiple, deadline, parseNum, sampleInput, reportCsv } from "./calc.mjs";

const P = { shares: 12000, price: 0, fmvGrant: 1, fmvSale: 5, vestMonths: 12, saleMonths: 24, ordRate: 0.3, cgRate: 0.2, leaveMonths: null, grantDate: null };

test("parseNum strips currency formatting and rejects junk", () => {
  assert.equal(parseNum("$1,250.50"), 1250.5);
  assert.equal(parseNum("35%"), 35);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("valueAt runs from grant value to sale value", () => {
  assert.equal(valueAt(1, 4, 0, 24), 1);
  assert.ok(Math.abs(valueAt(1, 4, 24, 24) - 4) < 1e-9);
  assert.ok(Math.abs(valueAt(1, 4, 12, 24) - 2) < 1e-9);
  assert.equal(valueAt(0, 10, 12, 24), 5);
});

test("election: ordinary tax on the grant spread, capital gain on the rest", () => {
  const t = taxes(P, 5);
  assert.equal(t.grantTax, 12000 * 1 * 0.3);
  assert.equal(t.elSale, 12000 * 4 * 0.2);
});

test("no election: each monthly tranche is taxed on its vest-day value", () => {
  const t = taxes({ ...P, vestMonths: 1, saleMonths: 24 }, 5);
  const v = Math.pow(5, 1 / 24);
  assert.ok(Math.abs(t.noVest - (v - 0) * 12000 * 0.3) < 1e-6);
  assert.ok(Math.abs(t.noSale - (5 - v) * 12000 * 0.2) < 1e-6);
});

test("zero spread means no tax at grant and the election never loses on a rising stock", () => {
  const t = taxes({ ...P, price: 1 }, 5);
  assert.equal(t.grantTax, 0);
  assert.ok(t.saving > 0);
});

test("a worthless outcome makes the election cost the grant tax", () => {
  const t = taxes(P, 0);
  assert.equal(t.elTotal, 3600);
  assert.ok(t.saving < 0);
});

test("leaving early: grant tax is paid on all shares, sale tax only on kept ones", () => {
  const all = taxes(P, 5);
  const half = taxes(P, 5, 6);
  assert.equal(half.grantTax, all.grantTax);
  assert.ok(Math.abs(half.elSale - all.elSale / 2) < 1e-6);
  assert.ok(half.noVest < all.noVest / 2 + 1e-6 && half.noVest > 0);
});

test("break-even multiple is where saving crosses zero", () => {
  const be = breakEvenMultiple(P);
  assert.equal(be.always, false);
  assert.ok(Math.abs(taxes(P, P.fmvSale * be.multiple).saving) < 1);
});

test("deadline is 30 days after the grant and rejects impossible dates", () => {
  assert.equal(deadline("2026-09-01").toISOString().slice(0, 10), "2026-10-01");
  assert.equal(deadline("2026-12-15").toISOString().slice(0, 10), "2027-01-14");
  assert.ok(Number.isNaN(deadline("2026-02-30")));
  assert.equal(deadline(""), null);
});

test("analyze validates inputs", () => {
  assert.match(analyze({ ...sampleInput(), shares: "" }).error, /Shares/);
  assert.match(analyze({ ...sampleInput(), fmvGrant: "" }).error, /grant/);
  assert.match(analyze({ ...sampleInput(), vestMonths: "12", saleMonths: "6" }).error, /until you sell/);
  assert.match(analyze({ ...sampleInput(), leaveMonths: "60" }).error, /leave/);
  assert.match(analyze({ ...sampleInput(), grantDate: "2026-13-40" }).error, /date/);
});

test("analyze on the sample reports zero grant tax and a forfeiture finding", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, null);
  assert.equal(a.base.grantTax, 0);
  assert.equal(a.scenarios.length, 5);
  assert.ok(a.findings.some((f) => /costs \$0/.test(f.title)));
  assert.ok(a.findings.some((f) => /leave after 18 months/.test(f.title)));
});

test("analyze counts days left against a supplied date", () => {
  const a = analyze({ ...sampleInput(), grantDate: "2026-09-01" }, new Date(Date.UTC(2026, 8, 20)));
  assert.equal(a.daysLeft, 11);
  assert.ok(analyze({ ...sampleInput(), grantDate: "2026-09-01" }, new Date(Date.UTC(2026, 9, 5))).daysLeft < 0);
});

test("csv has a header and one row per scenario", () => {
  const rows = reportCsv(analyze(sampleInput())).trim().split("\n");
  assert.equal(rows.length, 6);
  assert.match(rows[0], /tax_with_election/);
});
