import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, survival, ageAtSurvival, monthlyRows, presentValue, impliedReturn, sustainableMonthly, num, money, DEFAULTS } from "./calc.mjs";

test("survival is 1 at t=0, falls, and is exactly one half at the typed 50/50 age", () => {
  assert.equal(survival(0, 62, 85), 1);
  assert.ok(survival(10, 62, 85) > survival(20, 62, 85));
  assert.ok(Math.abs(survival(85 - 62, 62, 85) - 0.5) < 1e-9);
});

test("ageAtSurvival inverts survival", () => {
  for (const p of [0.75, 0.5, 0.1]) assert.ok(Math.abs(survival(ageAtSurvival(p, 62, 85) - 62, 62, 85) - p) < 1e-9);
});

test("a pension that starts later has fewer paid months and no payments before the start age", () => {
  const rows = monthlyRows({ ...DEFAULTS, startAge: 65 });
  assert.ok(rows[0].age >= 65);
  assert.ok(monthlyRows({ ...DEFAULTS, startAge: 70 }).length < rows.length);
});

test("COLA steps the pension up once a year from the start age", () => {
  const rows = monthlyRows({ ...DEFAULTS, cola: 2, startAge: 62 });
  assert.equal(rows[0].pension, 2200);
  assert.ok(Math.abs(rows[12].pension - 2200 * 1.02) < 1e-6);
});

test("with no spouse, expected payment is pension times own survival", () => {
  const r = monthlyRows({ ...DEFAULTS, spouseAge: 0 })[5];
  assert.ok(Math.abs(r.expected - r.pension * r.me) < 1e-9);
});

test("a spouse with a survivor benefit raises the expected value of the pension", () => {
  const solo = analyze({ ...DEFAULTS, spouseAge: 0 }).pvPension;
  const joint = analyze({ ...DEFAULTS, spouseAge: 60, survivorPct: 50 }).pvPension;
  assert.ok(joint > solo);
  assert.equal(analyze({ ...DEFAULTS, spouseAge: 60, survivorPct: 0 }).pvPension, solo);
});

test("living longer makes the pension worth more", () => {
  assert.ok(analyze({ ...DEFAULTS, lifeAge: 92 }).pvPension > analyze({ ...DEFAULTS, lifeAge: 78 }).pvPension);
});

test("a higher discount rate makes the pension worth less", () => {
  assert.ok(analyze({ ...DEFAULTS, discountRate: 8 }).pvPension < analyze({ ...DEFAULTS, discountRate: 3 }).pvPension);
});

test("implied return recovers the rate a lump sum was priced at", () => {
  const rows = monthlyRows(DEFAULTS);
  const price = presentValue(rows, 6);
  assert.ok(Math.abs(impliedReturn(price, rows) - 0.06) < 1e-6);
});

test("a lump sum equal to the expected PV has zero gap and implied return equal to the rate", () => {
  const base = analyze(DEFAULTS);
  const a = analyze({ ...DEFAULTS, lumpSum: base.pvPension });
  assert.ok(Math.abs(a.gap) < 1e-6);
  assert.ok(Math.abs(a.irr - DEFAULTS.discountRate / 100) < 1e-6);
});

test("tax on the lump sum lowers the net lump sum and the gap", () => {
  const a = analyze({ ...DEFAULTS, lumpTaxPct: 25 });
  assert.equal(a.lumpNet, DEFAULTS.lumpSum * 0.75);
  assert.ok(a.gap < analyze(DEFAULTS).gap);
});

test("undiscounted break-even age comes before the discounted one", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.breakEvenAge < a.breakEvenPvAge);
  assert.ok(a.reachBreakEven > a.reachBreakEvenPv);
});

test("zero discount rate break-even is lump / annual pension years after the start", () => {
  const a = analyze({ ...DEFAULTS, discountRate: 0, lumpSum: 26400, monthlyPension: 2200, startAge: 62 });
  assert.ok(Math.abs(a.breakEvenAge - (62 + 1)) < 0.09);
});

test("sustainable withdrawal with zero return is lump / months", () => {
  const o = { ...DEFAULTS, age: 65, startAge: 65, planAge: 75, cola: 0 };
  assert.ok(Math.abs(sustainableMonthly(120000, o, 0) - 1000) < 1e-6);
});

test("percentile ages fall as the survival chance falls", () => {
  const a = analyze(DEFAULTS);
  for (let i = 1; i < a.ages.length; i++) assert.ok(a.ages[i].age > a.ages[i - 1].age);
});

test("missing inputs produce warnings, not NaN crashes", () => {
  const a = analyze({ ...DEFAULTS, monthlyPension: 0, lumpSum: 0 });
  assert.ok(a.warnings.length >= 2);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});
