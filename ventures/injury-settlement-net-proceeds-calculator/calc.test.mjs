import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, settle, parseLiens, grossForNet, SAMPLE, summaryText, sweepCsv } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("fee, costs, liens and tax come off the gross in order", () => {
  const r = compute(raw({ liens: "Hospital, 10000, 50", taxablePortion: 0 }));
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.s.fee - 49995) < 1);
  assert.equal(r.s.lienTotal, 5000);
  assert.ok(Math.abs(r.s.net - (150000 - 49995 - 6500 - 5000)) < 1);
});

test("fee on net-of-costs basis is lower by the fee on the costs", () => {
  const g = compute(raw({ feeBasis: "gross" })).s.fee;
  const n = compute(raw({ feeBasis: "net" })).s.fee;
  assert.ok(Math.abs(g - n - 0.3333 * 6500) < 1);
});

test("Medicare line uses the pro-rata procurement-cost reduction, not a typed percentage", () => {
  const r = compute(raw({ liens: "Medicare conditional payments, 10000, 0", feePct: 30, costs: 5000, gross: 100000 }));
  assert.ok(Math.abs(r.s.liens[0].cut - 0.35) < 1e-9);
  assert.ok(Math.abs(r.s.lienTotal - 6500) < 1e-6);
  assert.ok(r.findings.some((f) => /final demand/.test(f.title)));
});

test("only the taxable portion is taxed", () => {
  const r = compute(raw({ taxablePortion: 20000, taxRate: 25, liens: "" }));
  assert.equal(r.s.tax, 5000);
});

test("negative net is called out", () => {
  const r = compute(raw({ gross: 20000, liens: "Hospital, 40000", costs: 3000 }));
  assert.ok(r.s.net < 0);
  assert.equal(r.findings[0].severity, "high");
});

test("bad input is reported, not computed", () => {
  assert.ok(compute(raw({ gross: "" })).errors.length);
  assert.ok(compute(raw({ feePct: 150 })).errors.length);
  assert.ok(parseLiens("Hospital, abc").errors.length);
  assert.ok(parseLiens("Hospital, 100, 140").errors.length);
});

test("grossForNet inverts settle", () => {
  const { p } = compute(raw());
  const g = grossForNet(p, 50000);
  assert.ok(Math.abs(settle({ ...p, gross: g }).net - 50000) < 1);
});

test("sweep is increasing and exports", () => {
  const r = compute(raw());
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].net > r.sweep[i - 1].net);
  assert.match(summaryText(r), /Client nets/);
  assert.match(sweepCsv(r), /^gross,net_to_client/);
});
