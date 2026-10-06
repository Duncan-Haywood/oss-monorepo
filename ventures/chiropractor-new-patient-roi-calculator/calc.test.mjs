import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSegments, segmentValue, analyse, money, pct } from "./calc.mjs";

test("parseSegments reads commas, tabs, dollar signs and reports bad lines", () => {
  const { rows, bad } = parseSegments("Name\tShare\tVisits\tCollected\tCost\nCash plan, 60, 24, $55, 18\nPI\t10\t30\t120\t25\nbroken line\nZero, 0, 5, 50, 5");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: "Cash plan", share: 60, visits: 24, collected: 55, cost: 18 });
  assert.equal(rows[1].collected, 120);
  assert.equal(bad.length, 2);
});

test("segmentValue adds the new-patient exam and subtracts per-visit cost", () => {
  const v = segmentValue({ visits: 10, collected: 50, cost: 20 }, 100);
  assert.deepEqual(v, { revenue: 600, cost: 200, margin: 400 });
});

const base = {
  segments: "Cash plan, 60, 24, 55, 18\nInsurance, 40, 12, 45, 18",
  spend: 3000, leads: 100, bookedPct: 60, showPct: 80, newPatientExtra: 100, targetRoi: 300, fixedPerMonth: 0,
};

test("blended value weights segments by share", () => {
  const { result } = analyse(base);
  // cash: 24*55+100=1420 rev, 432 cost ; ins: 12*45+100=640 rev, 216 cost
  assert.equal(Math.round(result.blended.revenue), Math.round(0.6 * 1420 + 0.4 * 640));
  assert.equal(Math.round(result.blended.cost), Math.round(0.6 * 432 + 0.4 * 216));
});

test("shares need not sum to 100", () => {
  const a = analyse({ ...base, segments: "A, 3, 10, 50, 10\nB, 1, 10, 50, 10" }).result;
  const b = analyse({ ...base, segments: "A, 75, 10, 50, 10\nB, 25, 10, 50, 10" }).result;
  assert.equal(a.blended.margin, b.blended.margin);
});

test("funnel: new patients, CAC and cost per lead", () => {
  const { result } = analyse(base);
  assert.equal(result.newPatients, 48);
  assert.equal(result.cac, 62.5);
  assert.equal(result.costPerLead, 30);
});

test("ROI, ceiling and payback", () => {
  const { result } = analyse(base);
  const m = result.blended.margin;
  assert.ok(Math.abs(result.roi - (m - 62.5) / 62.5) < 1e-9);
  assert.ok(Math.abs(result.maxCac - m / 4) < 1e-9);
  assert.ok(Math.abs(result.maxCostPerLead - (m / 4) * 0.48) < 1e-9);
  assert.ok(result.paybackVisits > 0 && result.paybackVisits < 2);
});

test("monthly profit subtracts spend and fixed costs", () => {
  const { result } = analyse({ ...base, fixedPerMonth: 1000 });
  assert.ok(Math.abs(result.monthlyProfit - (48 * result.blended.margin - 3000 - 1000)) < 1e-6);
});

test("flags a patient that costs more to win than they return", () => {
  const { findings } = analyse({ ...base, spend: 200000 });
  assert.ok(findings.some((f) => /costs more to win/.test(f.title)));
});

test("flags a below-target but positive return", () => {
  const { result, findings } = analyse({ ...base, spend: 48 * 400, targetRoi: 300 });
  assert.ok(result.cac > result.maxCac && result.cac < result.blended.margin);
  assert.ok(findings.some((f) => /below your target/.test(f.title)));
});

test("flags negative margin before marketing", () => {
  const { findings } = analyse({ ...base, segments: "Loss, 100, 10, 10, 50" });
  assert.ok(findings.some((f) => /lose money before marketing/.test(f.title)));
});

test("no leads or shows gives null CAC rather than NaN or Infinity", () => {
  const { result } = analyse({ ...base, leads: 0 });
  assert.equal(result.cac, null);
  assert.equal(result.roi, null);
  assert.equal(result.paybackVisits, null);
});

test("empty input yields a high finding and no result", () => {
  const { result, findings } = analyse({ ...base, segments: "" });
  assert.equal(result, null);
  assert.equal(findings[0].severity, "high");
});

test("formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(null), "n/a");
  assert.equal(pct(0.5), "50.0%");
});
