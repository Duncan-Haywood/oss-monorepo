import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, monthlyFlows, declineFactor, presentValue, impliedReturn, num, money, DEFAULTS } from "./calc.mjs";

const flat = { monthlyCheck: 1000, declineInitial: 0, bFactor: 1, declineTerminal: 0, priceChange: 0, minCheck: 0, newWellCheck: 0, horizon: 5, soldYears: 5, discountRate: 0, lumpTaxPct: 0, incomeTaxPct: 0 };

test("a flat 5-year stream with no decline sums to 60,000", () => {
  const a = analyze({ ...flat, offer: 30000 });
  assert.ok(Math.abs(a.undiscounted - 60000) < 1e-6);
  assert.equal(a.paybackMonth, 30);
  assert.equal(a.multiple, 30);
});

test("exponential decline (b = 0) matches exp(-D t)", () => {
  assert.ok(Math.abs(declineFactor(2, 30, 0, 0) - Math.exp(-0.6)) < 1e-12);
});

test("hyperbolic decline matches the Arps closed form before the switch", () => {
  const f = declineFactor(3, 40, 1, 0);
  assert.ok(Math.abs(f - 1 / (1 + 0.4 * 3)) < 1e-12);
});

test("terminal decline switches the curve to exponential without a jump", () => {
  const di = 40, b = 1, dterm = 8;
  const tSwitch = (0.4 / 0.08 - 1) / 0.4;
  assert.ok(Math.abs(tSwitch - 10) < 1e-12);
  const before = declineFactor(tSwitch - 1e-9, di, b, dterm);
  const after = declineFactor(tSwitch + 1e-9, di, b, dterm);
  assert.ok(Math.abs(before - after) < 1e-6);
  // instantaneous decline at the switch equals the terminal rate
  const h = 1e-6;
  const d = -(Math.log(declineFactor(tSwitch + h, di, b, dterm)) - Math.log(declineFactor(tSwitch, di, b, dterm))) / h;
  assert.ok(Math.abs(d - 0.08) < 1e-4);
  // past the switch the curve is thinner than the unswitched hyperbolic, which would keep declining ever more slowly
  assert.ok(declineFactor(30, di, b, dterm) < declineFactor(30, di, b, 0));
});

test("steeper decline lowers value; the flow never increases", () => {
  const lo = analyze({ ...DEFAULTS, declineInitial: 20 }).pvSold;
  const hi = analyze({ ...DEFAULTS, declineInitial: 70 }).pvSold;
  assert.ok(hi < lo);
  const f = monthlyFlows({ ...DEFAULTS, newWellCheck: 0 }).map((r) => r.expected);
  for (let i = 1; i < f.length; i++) assert.ok(f[i] <= f[i - 1] + 1e-9);
});

test("wells shut in below the minimum check", () => {
  const f = monthlyFlows({ ...DEFAULTS, newWellCheck: 0, minCheck: 500 });
  assert.equal(f[f.length - 1].expected, 0);
  assert.ok(f[0].expected > 500);
});

test("planned wells add value only from their start month and scale with the chance", () => {
  const none = monthlyFlows({ ...DEFAULTS, newWellCheck: 0 });
  const some = monthlyFlows({ ...DEFAULTS, newWellMonth: 10, newWellCheck: 1000, newWellChance: 50 });
  assert.equal(some[8].expected, none[8].expected);
  assert.ok(some[9].wells > 0 && Math.abs(some[9].wells - 1000 * 0.5 * declineFactor(0.5 / 12, DEFAULTS.declineInitial, DEFAULTS.bFactor, DEFAULTS.declineTerminal)) < 1e-6);
});

test("price change scales every flow", () => {
  const a = analyze({ ...DEFAULTS, minCheck: 0, priceChange: 0 }).pvSold;
  const b = analyze({ ...DEFAULTS, minCheck: 0, priceChange: 20 }).pvSold;
  assert.ok(Math.abs(b / a - 1.2) < 1e-9);
});

test("present value of a level monthly stream matches the closed form", () => {
  const pv = presentValue(Array(60).fill(1000), 6);
  const v = Math.pow(1.06, -1 / 12);
  assert.ok(Math.abs(pv - (1000 * v * (1 - Math.pow(v, 60))) / (1 - v)) < 1e-6);
});

test("implied return recovers the rate a stream was priced at", () => {
  const flows = Array(120).fill(500);
  const price = presentValue(flows, 15);
  assert.ok(Math.abs(impliedReturn(price, flows) - 0.15) < 1e-6);
});

test("an offer larger than the cash is a negative return and a zero offer has none", () => {
  assert.ok(impliedReturn(9000, [4000, 4000]) < 0);
  assert.ok(Number.isNaN(impliedReturn(0, [100])));
});

test("an offer equal to PV at your rate has a zero gap and implied return equal to your rate", () => {
  const base = analyze({ ...DEFAULTS });
  const a = analyze({ ...DEFAULTS, offer: base.pvSold });
  assert.ok(Math.abs(a.gap) < 1e-6);
  assert.ok(Math.abs(a.irr - DEFAULTS.discountRate / 100) < 1e-6);
});

test("selling only part of the term leaves the rest as kept value", () => {
  const a = analyze({ ...DEFAULTS, soldYears: 10 });
  assert.equal(a.sold, 10);
  const all = analyze({ ...DEFAULTS, soldYears: 30 });
  assert.ok(Math.abs(a.pvSold + a.pvKept - all.pvSold) < 1e-6);
});

test("existing-wells-only value is below the value with planned wells, and so is the implied buyer return", () => {
  const a = analyze({ ...DEFAULTS });
  assert.ok(a.pvSoldBare < a.pvSold);
  assert.ok(a.irrBare < a.irr);
});

test("tax on the lump sum uses basis", () => {
  const a = analyze({ ...DEFAULTS, basis: 10000, lumpTaxPct: 20 });
  assert.equal(a.lumpTax, (DEFAULTS.offer - 10000) * 0.2);
  assert.equal(a.offerAfterTax, DEFAULTS.offer - a.lumpTax);
});

test("sensitivity grid is monotone: faster decline and higher discount rate both lower value", () => {
  const a = analyze({ ...DEFAULTS });
  for (const row of a.grid) for (let i = 1; i < row.values.length; i++) assert.ok(row.values[i] <= row.values[i - 1]);
  for (let r = 1; r < a.grid.length; r++) assert.ok(a.grid[r].values[0] < a.grid[r - 1].values[0]);
  for (let i = 1; i < a.priceRow.length; i++) assert.ok(a.priceRow[i].pv > a.priceRow[i - 1].pv);
});

test("bad inputs warn rather than throw", () => {
  const a = analyze({ monthlyCheck: 0, horizon: 0, offer: 0 });
  assert.ok(a.warnings.length >= 2);
  assert.doesNotThrow(() => analyze({}));
  assert.doesNotThrow(() => analyze({ bFactor: NaN, declineInitial: -5, horizon: 500 }));
});

test("num and money parse and format", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});
