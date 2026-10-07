import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, scenariosCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`);

test("entry cost is tuition plus fees plus pay given up in school", () => {
  const r = compute(raw());
  close(r.entryCost, 5000 + 600 + 6 * 800);
  close(r.lostIncome, 4800);
});

test("monthly gain follows the stated rule and payback is cost over gain", () => {
  const r = compute(raw());
  const gain = ((2200 * 0.52 - 60) * 48 - 800 * 48) / 12;
  close(r.monthlyGain, gain);
  close(r.paybackMonths, r.entryCost / gain);
  close(r.weeklyGross, 2200 * 0.52);
  close(r.annualGross, 2200 * 0.52 * 48);
});

test("more miles shorten payback; scenario table is sorted and includes the plan", () => {
  const r = compute(raw());
  assert.deepEqual(r.scenarios.map((s) => s.milesPerWeek), [1500, 1800, 2000, 2200, 2500, 2800, 3000]);
  const pays = r.scenarios.filter((s) => s.paybackMonths !== null).map((s) => s.paybackMonths);
  assert.deepEqual([...pays].sort((a, b) => b - a), pays);
});

test("a job that pays less than the current one never pays back", () => {
  const r = compute(raw({ milesPerWeek: "900" }));
  assert.equal(r.paybackMonths, null);
  assert.equal(r.findings[0].severity, "high");
  assert.match(summaryText(r), /never/);
});

test("sponsored route compares net position over the horizon", () => {
  const r = compute(raw());
  const gain = r.monthlyGain;
  const sg = ((2200 * 0.46 - 60) * 48 - 800 * 48) / 12;
  close(r.sponsored.privateNet, 36 * gain - r.entryCost);
  close(r.sponsored.sponsoredNet, 12 * sg + 24 * gain - (300 + 4800));
  close(r.sponsored.difference, r.sponsored.privateNet - r.sponsored.sponsoredNet);
});

test("sponsored section is absent when no sponsored rate is entered", () => {
  assert.equal(compute(raw({ sponsoredCentsPerMile: "", sponsoredMonths: "" })).sponsored, null);
});

test("bad input is rejected with a reason", () => {
  assert.ok(compute(raw({ milesPerWeek: "" })).errors.length);
  assert.ok(compute(raw({ centsPerMile: "0" })).errors.length);
  assert.ok(compute(raw({ weeksWorked: "60" })).errors.length);
  assert.ok(compute(raw({ tuition: "-5" })).errors.length);
  assert.ok(compute(raw({ horizon: "2" })).errors.length);
});

test("csv and dollars format", () => {
  const csv = scenariosCsv(compute(raw())).split("\n");
  assert.equal(csv[0], "miles_per_week,annual_gross,monthly_gain,payback_months");
  assert.equal(csv.length, 8);
  assert.equal(dollars(1234.5), "$1,234.50");
});
