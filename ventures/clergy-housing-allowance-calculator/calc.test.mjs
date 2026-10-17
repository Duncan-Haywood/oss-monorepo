import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExpenses, plan, seTax, resolution, sampleInput, toCsv } from "./calc.mjs";

const base = { mode: "own", wages: 48000, designated: 24000, fairRental: 2400, bizExpenses: 0, fedRate: 12, stateRate: 0, cushion: 0, wageBase: 184500, expenses: "Mortgage, 2000, month" };

test("exclusion is the least of designated, actual costs and fair rental value", () => {
  assert.equal(plan({ ...base, designated: 20000 }).excluded, 20000);
  assert.equal(plan({ ...base, designated: 30000, expenses: "Mortgage, 1500, month" }).excluded, 18000);
  assert.equal(plan({ ...base, designated: 40000, expenses: "Mortgage, 3000, month" }).excluded, 28800);
});

test("designation above the limit is taxable excess; designation below the cap is a missed exclusion", () => {
  const over = plan({ ...base, designated: 30000, expenses: "Mortgage, 1500, month" });
  assert.equal(over.taxableExcess, 12000);
  assert.equal(over.limiter, "expenses");
  const under = plan({ ...base, designated: 10000 });
  assert.equal(under.missed, 14000);
  assert.equal(under.missedTax, 1680);
  assert.equal(under.limiter, "designated");
});

test("fair rental value caps the exclusion", () => {
  const r = plan({ ...base, designated: 40000, expenses: "Mortgage, 3000, month" });
  assert.equal(r.limiter, "rental");
  assert.match(r.advice.join(" "), /cap/);
});

test("income tax saved is exclusion times combined rate", () => {
  const r = plan({ ...base, designated: 20000, stateRate: 4 });
  assert.equal(r.incomeTaxSaved, 3200);
});

test("SE tax: 92.35% of earnings, 15.3% under the wage base, 2.9% only above it", () => {
  assert.equal(seTax(0, 184500), 0);
  assert.equal(seTax(10000, 184500), 1412.96);
  assert.equal(seTax(300000, 184500), 30912.45);
});

test("housing exclusion adds SE tax but designating less never lowers it", () => {
  const r = plan({ ...base, designated: 20000 });
  assert.equal(r.seEarnings, 68000);
  assert.equal(r.seOnHousing, round(seTax(68000, 184500) - seTax(48000, 184500)));
});
const round = (x) => Math.round(x * 100) / 100;

test("parsonage: fair rental value excluded plus designated utilities up to actual", () => {
  const r = plan({ mode: "parsonage", wages: 40000, designated: 3000, fairRental: 1800, fedRate: 12, expenses: "Utilities, 200, month" });
  assert.equal(r.excluded, 21600 + 2400);
  assert.equal(r.taxableExcess, 600);
});

test("expense lines accept commas in labels and either unit", () => {
  const { items, errors } = parseExpenses("Gas, electric and water, 300, month\nInsurance, 1200, year\nRepairs, 100");
  assert.deepEqual(errors, []);
  assert.deepEqual(items.map((i) => i.annual), [3600, 1200, 1200]);
});

test("bad input is reported rather than computed", () => {
  assert.ok(plan({ ...base, expenses: "oops" }).error);
  assert.ok(plan({ ...base, fairRental: "" }).error);
  assert.ok(plan({ ...base, wages: "" }).error);
  assert.ok(plan({ ...base, fedRate: 90 }).error);
  assert.ok(plan({ ...base, mode: "castle" }).error);
});

test("resolution carries the recommended amount and a not-advice line", () => {
  const r = plan(sampleInput());
  const text = resolution(r, { church: "First Church", minister: "Pastor Lee", year: "2027" });
  assert.match(text, /First Church/);
  assert.match(text, /\$28,800\.00/);
  assert.match(text, /not legal or tax advice/);
});

test("sample and CSV", () => {
  const r = plan(sampleInput());
  assert.ok(!r.error);
  assert.match(toCsv(r), /^measure,annual_amount\ndesignated,24000/);
});
