import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, flows, npv, irr, payback, parseInputs, toCsv, EXAMPLE_SHARED, SHARED_DEFAULTS, MACRS_5 } from "./calc.mjs";

const ex = (o = {}) => ({ ...EXAMPLE_SHARED, ...o });
const v = (o = {}) => parseInputs(ex(o), []);

test("MACRS 5-year schedule sums to 100%", () => {
  assert.ok(Math.abs(MACRS_5.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("npv, irr and payback on a simple stream", () => {
  assert.ok(Math.abs(npv([-100, 110], 0.1)) < 1e-9);
  assert.ok(Math.abs(irr([-100, 110]) - 0.1) < 1e-6);
  assert.equal(payback([-100, 60, 60]), 1 + 40 / 60);
  assert.equal(payback([-100, 10, 10]), null);
});

test("buy: upfront is cost less incentive, financed share moves it into the loan", () => {
  const cash = flows(v({ taxRate: "0", itc: "0", stateIncent: "10000" }), "buy");
  assert.equal(cash[0], -(100 * 1000 * 2.1 - 10000));
  const fin = flows(v({ taxRate: "0", itc: "0", financed: "100", apr: "0", loanYears: "10" }), "buy");
  assert.equal(fin[0] + 0, 0);
  // 210,000 over 10 years with 0% interest: 21,000 a year out, nothing after
  const base = flows(v({ taxRate: "0", itc: "0", financed: "0" }), "buy");
  assert.ok(Math.abs(base[1] - fin[1] - 21000) < 1e-6);
  assert.ok(Math.abs(base[11] - fin[11]) < 1e-6);
});

test("tax credit lands in year 1 and is ignored when the tax rate is zero", () => {
  const withItc = flows(v({ itc: "30" }), "buy");
  const noItc = flows(v({ itc: "0" }), "buy");
  assert.ok(withItc[1] - noItc[1] > 0.3 * 210000 * 0.9);
  const zeroTax = flows(v({ itc: "30", taxRate: "0" }), "buy");
  const zeroTaxNo = flows(v({ itc: "0", taxRate: "0" }), "buy");
  assert.deepEqual(zeroTax, zeroTaxNo);
});

test("PPA year-1 saving is production times the rate gap, after tax", () => {
  const p = v({ taxRate: "0", ppaRate: "0.10", util: "0.14" });
  const f = flows(p, "ppa");
  assert.equal(f[0], 0);
  assert.ok(Math.abs(f[1] - 135000 * 0.04) < 1e-6);
});

test("lease year 1 is 12 payments against bill savings", () => {
  const f = flows(v({ taxRate: "0", leasePay: "1000" }), "lease");
  assert.ok(Math.abs(f[1] - (135000 * 0.14 - 12000)) < 1e-6);
});

test("after the term the buyout is paid once and the system is then owned", () => {
  const f = flows(v({ taxRate: "0", ppaTerm: "10", buyout: "10" }), "ppa");
  const g = flows(v({ taxRate: "0", ppaTerm: "10", buyout: "0" }), "ppa");
  assert.ok(Math.abs(g[10] - f[10] - 21000) < 1e-6);
  assert.ok(Math.abs(g[11] - f[11]) < 1e-9);
  assert.ok(f[11] > 0);
});

test("analyze returns three options, a best one and a break-even PPA rate that equates NPVs", () => {
  const a = analyze(ex());
  assert.equal(a.ok, true);
  assert.deepEqual(Object.keys(a.opts).sort(), ["buy", "lease", "ppa"]);
  assert.ok(["buy", "lease", "ppa"].includes(a.best));
  assert.ok(a.breakeven.rate > 0);
  const d = 0.08;
  const atBe = npv(flows(a.v, "ppa", { ppaRate: a.breakeven.rate }), d);
  assert.ok(Math.abs(atBe - a.opts.buy.npv) < 1);
  assert.equal(a.sens.length, 4);
});

test("a PPA at a free rate cannot lose to buying when buying has a negative NPV", () => {
  const a = analyze(ex({ costPerW: "6", itc: "0" }));
  assert.ok(a.opts.buy.npv < a.opts.ppa.npv);
});

test("bad input is reported and nothing is computed", () => {
  const a = analyze(ex({ kw: "abc", disc: "-5" }));
  assert.equal(a.ok, false);
  assert.ok(a.warnings.length >= 2);
  assert.equal(analyze(ex({ years: "100" })).ok, false);
});

test("warnings: PPA above utility rate, zero tax rate, and term shorter than analysis", () => {
  const w = analyze(ex({ ppaRate: "0.20", taxRate: "0" })).warnings.join(" ");
  assert.match(w, /at or above your utility rate/);
  assert.match(w, /Tax rate is 0/);
  assert.match(w, /buy the system out/);
});

test("csv has a row per year plus NPV", () => {
  const a = analyze(ex());
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 1 + 26 + 1);
  assert.match(lines.at(-1), /^NPV,/);
});

test("every default parses", () => {
  const w = [];
  parseInputs(SHARED_DEFAULTS, w);
  assert.deepEqual(w, []);
});
