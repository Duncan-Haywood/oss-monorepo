import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("profit follows the stated rule on the sample", () => {
  const r = compute(raw());
  const nights = 40 * 6 * 30.4 * 0.55, k = 0.92;
  const per = (48 + 6 / 2.5) * k - 4 - (15 / 60) * 16 / 2.5;
  assert.ok(Math.abs(r.profit - (nights * per - 120000)) < 0.01);
  assert.ok(Math.abs(r.nights - nights) < 1e-9);
});

test("pricing at the target rate really pays the target", () => {
  const r = compute(raw());
  const back = compute(raw({ nightly: String(r.targetRate) }));
  assert.ok(Math.abs(back.profit - 40000) < 25);
});

test("break-even rate and break-even occupancy give zero profit", () => {
  const r = compute(raw());
  assert.ok(Math.abs(compute(raw({ nightly: String(r.breakEvenRate) })).profit) < 25);
  const at = compute(raw({ occupancy: String(r.breakEvenOcc) }));
  assert.ok(Math.abs(at.profit) < 5);
});

test("a loss is flagged high with the break-even rate", () => {
  const r = compute(raw({ nightly: "25" }));
  assert.ok(r.profit < 0);
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /loses about/);
});

test("a night that costs more than it earns makes break-even unreachable", () => {
  const r = compute(raw({ nightly: "2", stayFee: "0" }));
  assert.equal(r.breakEvenOcc, null);
  assert.match(summaryText(r), /not reachable/);
});

test("break-even above 100 percent is flagged", () => {
  const r = compute(raw({ fixedYear: "400000" }));
  assert.ok(r.breakEvenOcc > 100);
  assert.ok(r.findings.some((f) => /Even full/.test(f.title)));
});

test("sweep covers fixed steps plus the current occupancy and is sorted", () => {
  const r = compute(raw({ occupancy: "55" }));
  assert.deepEqual(r.sweep.map((x) => x.occ), [30, 40, 50, 55, 60, 70, 80, 90]);
  assert.ok(r.sweep[0].profit < r.sweep[7].profit);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines[0], "occupancy_pct,occupied_nights,yearly_revenue,yearly_profit");
  assert.equal(lines.length, 9);
});

test("optional fields may be blank", () => {
  const r = compute({ sites: "10", openMonths: "12", occupancy: "100", nightly: "30", fixedYear: "1000" });
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.profit - (10 * 12 * 30.4 * 30 - 1000)) < 0.01);
});

test("bad input is reported, not computed", () => {
  assert.ok(compute(raw({ sites: "0" })).errors.length);
  assert.ok(compute(raw({ openMonths: "13" })).errors.length);
  assert.ok(compute(raw({ occupancy: "120" })).errors.length);
  assert.ok(compute(raw({ nightly: "abc" })).errors.length);
  assert.ok(compute(raw({ platformPct: "60" })).errors.length);
  assert.ok(compute(raw({ avgStay: "0.5" })).errors.length);
});

test("summary and dollars format", () => {
  assert.equal(dollars(-1234.5), "-$1,234.50");
  assert.match(summaryText(compute(raw())), /Campground: 40 sites, 6 months open/);
});
