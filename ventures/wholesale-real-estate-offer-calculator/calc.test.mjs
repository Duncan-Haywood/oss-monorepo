import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseComps, compsArv, routes, toCsv, EXAMPLE_SHARED, SHARED_DEFAULTS } from "./calc.mjs";

const base = { ...SHARED_DEFAULTS, arv: "300000", repairs: "40000", fee: "10000", holding: "9000" };

test("rule price is ARV x rule less repairs; profit price is ARV net of selling costs, repairs, holding and profit", () => {
  const a = analyze(base);
  assert.equal(a.c.ruleMax, 300000 * 0.7 - 40000);          // 170000
  assert.equal(a.c.profitMax, 300000 * 0.92 - 40000 - 9000 - 45000); // 182000
  assert.equal(a.c.buyer, 170000);
  assert.equal(a.c.binding, "rule");
  assert.equal(a.contractTarget, 160000);
});

test("the profit test binds when the buyer needs more profit than the rule leaves", () => {
  const a = analyze({ ...base, profitPct: "25" });
  assert.equal(a.c.binding, "profit");
  assert.equal(a.c.buyer, 300000 * 0.92 - 40000 - 9000 - 75000);
});

test("buyer profit at the assigned price is positive at the profit-based ceiling and matches by hand", () => {
  const a = analyze(base);
  assert.equal(a.buyer.pays, 170000);
  assert.equal(a.buyer.profit, 300000 * 0.92 - 170000 - 40000 - 9000); // 57000
  assert.ok(a.buyer.profit > 0);
});

test("asking price: fee left is ceiling minus asking, with a verdict", () => {
  assert.equal(analyze({ ...base, asking: "150000" }).asking.feeLeft, 20000);
  assert.equal(analyze({ ...base, asking: "150000" }).asking.verdict, "works at your target fee");
  const mid = analyze({ ...base, asking: "163000", minFee: "5000" });
  assert.equal(mid.asking.verdict, "works, but below your target fee");
  assert.equal(analyze({ ...base, asking: "169000", minFee: "5000" }).asking.verdict, "does not work at this price");
});

test("double close costs funding, extra closing and transfer tax on both deeds; assignment costs none of them", () => {
  const p = { marketing: 300, acqClose: 0, dcFundPct: 1.5, dcClose: 1800, transferPct: 0.2 };
  const r = routes(100000, 10000, p);
  assert.equal(r.assign, 9700);
  assert.equal(r.dcFunding, 1500);
  assert.equal(r.dcTransfer, 0.002 * (100000 + 110000));
  assert.ok(Math.abs(r.doubleClose - (10000 - 300 - 1500 - 1800 - 420)) < 1e-9);
  assert.ok(r.breakEvenFee > 0 && r.breakEvenFee < 10000);
});

test("break-even fee is the fee at which double closing nets zero", () => {
  const p = { marketing: 300, acqClose: 100, dcFundPct: 1.5, dcClose: 1800, transferPct: 0.2 };
  const r0 = routes(100000, 0, p);
  const r = routes(100000, r0.breakEvenFee, p);
  assert.ok(Math.abs(r.doubleClose) < 1e-6);
});

test("comps: size-adjusted ARV uses median price per square foot", () => {
  const w = [];
  const comps = parseComps("Label, Price, Sqft\nA, 200000, 1000\nB, 330000, 1500\nC, 300000, 1200", w);
  assert.equal(comps.length, 3);
  const r = compsArv(comps, 1400);
  assert.equal(r.ppsf, 220); // 200, 220, 250 -> 220
  assert.equal(r.arv, 308000);
});

test("comps without square footage fall back to median price and say so", () => {
  const w = [];
  const comps = parseComps("A, 200000\nB, 260000\nC, 240000", w);
  assert.equal(compsArv(comps, null).arv, 240000);
  assert.match(compsArv(comps, null).method, /median sold price/);
});

test("ARV falls back to comps only when the ARV box is blank", () => {
  const a = analyze({ ...base, arv: "", sqft: "1450", comps: EXAMPLE_SHARED.comps });
  assert.match(a.arvSource, /^comps/);
  assert.ok(a.arv > 200000 && a.arv < 300000);
  assert.equal(analyze({ ...base, comps: EXAMPLE_SHARED.comps }).arvSource, "your ARV");
});

test("bad comp lines are skipped with a warning, not silently", () => {
  const w = [];
  const comps = parseComps("A, 200000, 1000\nB, abc, 1000\nC, 250000, -5", w);
  assert.equal(comps.length, 1);
  assert.equal(w.length, 2);
});

test("repairs that swallow the ARV warn that no deal exists", () => {
  const a = analyze({ ...base, repairs: "250000" });
  assert.ok(a.ok);
  assert.ok(a.c.buyer < 0);
  assert.ok(a.warnings.some((w) => /cannot pay anything/.test(w)));
});

test("missing or invalid inputs fail with a reason instead of a number", () => {
  assert.equal(analyze({ ...SHARED_DEFAULTS }).ok, false);
  assert.equal(analyze({ ...base, fee: "" }).ok, false);
  assert.equal(analyze({ ...base, rule: "150" }).ok, false);
  assert.equal(analyze({ ...base, repairs: "-5" }).ok, false);
});

test("sensitivity: a lower ARV lowers the ceiling and the fee left at asking", () => {
  const a = analyze({ ...base, asking: "150000" });
  assert.equal(a.sensitivity.length, 5);
  assert.ok(a.sensitivity[0].buyer < a.sensitivity[2].buyer);
  assert.ok(a.sensitivity[0].feeAtAsking < a.sensitivity[4].feeAtAsking);
  assert.equal(a.sensitivity[2].buyer, a.c.buyer);
});

test("the example loads, solves and exports a CSV", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok, a.warnings.join("; "));
  assert.ok(toCsv(a).startsWith("Item,Value"));
  assert.ok(toCsv(a).includes("Asking verdict"));
});
