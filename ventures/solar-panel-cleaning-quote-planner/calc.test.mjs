import { test } from "node:test";
import assert from "node:assert/strict";
import { quote, jobCost, priceCurve, parseJobs, dayPlan, annualPlan, customerPayback, EXAMPLE_JOBS, num, money } from "./calc.mjs";

const opts = { minPerPanel: 2, setupMin: 10, rate: 30, crew: 1, overheadPct: 0, perKm: 0.5, consumables: 5, marginPct: 40, minCharge: 0, dayHours: 8 };
const job = { panels: 20, access: "ground", travelMin: 20, travelKm: 10 };

test("wall time is setup + travel + panel minutes / crew", () => {
  assert.equal(jobCost(job, opts).wall, 10 + 20 + 40);
  assert.equal(jobCost(job, { ...opts, crew: 2 }).wall, 10 + 20 + 20);
});

test("cost adds labour, vehicle, consumables and overhead", () => {
  const c = jobCost(job, { ...opts, overheadPct: 10 });
  assert.equal(Math.round(c.labour * 100) / 100, 35);
  assert.equal(Math.round(c.overhead * 100) / 100, 3.5);
  assert.equal(c.vehicle, 5);
  assert.equal(Math.round(c.total * 100) / 100, 35 + 3.5 + 5 + 5);
});

test("price hits the target margin on the price, not on the cost", () => {
  const q = quote(job, opts);
  assert.ok(Math.abs(q.marginPct - 40) < 1e-9);
  assert.ok(Math.abs(q.price - q.total / 0.6) < 1e-9);
});

test("minimum call-out overrides a lower price and is flagged", () => {
  const q = quote({ ...job, panels: 4 }, { ...opts, minCharge: 150 });
  assert.equal(q.price, 150);
  assert.equal(q.minChargeApplies, true);
  assert.ok(q.marginPct > 40);
});

test("roof access makes the same array cost more", () => {
  const g = quote(job, opts).price, d = quote({ ...job, access: "double" }, opts).price;
  assert.ok(d > g);
});

test("price per panel falls as panels rise when a minimum applies", () => {
  const curve = priceCurve(job, { ...opts, minCharge: 120 });
  assert.ok(curve[0].perPanel > curve[curve.length - 1].perPanel);
  assert.equal(curve[0].minChargeApplies, true);
  assert.equal(curve[curve.length - 1].minChargeApplies, false);
});

test("parseJobs reads good lines and reports bad ones", () => {
  const ok = parseJobs(EXAMPLE_JOBS);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.jobs.length, 6);
  const bad = parseJobs("x, 0, ground, 10\ny, 5, roofish, 10\nz, 5, single, 10, 4");
  assert.equal(bad.errors.length, 2);
  assert.equal(bad.jobs.length, 1);
  assert.equal(bad.jobs[0].travelKm, 4);
});

test("dayPlan packs jobs into days within capacity and sums revenue", () => {
  const { jobs } = parseJobs(EXAMPLE_JOBS);
  const plan = dayPlan(jobs, opts);
  assert.ok(plan.days.length >= 1);
  for (const d of plan.days) assert.ok(d.minutes <= 480 || d.items.length === 1);
  const sum = plan.days.flatMap((d) => d.items).length;
  assert.equal(sum, jobs.length);
  assert.ok(Math.abs(plan.revenue - plan.days.reduce((a, d) => a + d.revenue, 0)) < 1e-9);
});

test("a job longer than a day is flagged and still gets scheduled", () => {
  const plan = dayPlan([{ label: "huge", panels: 400, access: "ground", travelMin: 10, travelKm: 5 }], opts);
  assert.deepEqual(plan.unquotable, ["huge"]);
  assert.equal(plan.days.length, 1);
  assert.equal(plan.days[0].overrun, true);
});

test("annual plan scales with customers and cleans", () => {
  const a = annualPlan(job, opts, 2, 50);
  assert.equal(a.cleans, 100);
  assert.ok(Math.abs(a.revenue - 100 * quote(job, opts).price) < 1e-9);
  assert.ok(a.workDays > 0);
});

test("customer payback: break-even soiling loss matches the spend", () => {
  const p = customerPayback({ systemKw: 6, yieldKwhPerKw: 1300, soilingLossPct: 5, ratePerKwh: 0.2, cleanPrice: 100, cleansPerYear: 1 });
  assert.equal(p.annual, 7800);
  assert.equal(Math.round(p.recoverValue), 78);
  assert.equal(p.worthIt, false);
  assert.ok(Math.abs(p.breakEvenLossPct - (100 / (7800 * 0.2)) * 100) < 1e-9);
  const q = customerPayback({ systemKw: 6, yieldKwhPerKw: 1300, soilingLossPct: 10, ratePerKwh: 0.2, cleanPrice: 100, cleansPerYear: 1 });
  assert.equal(q.worthIt, true);
});

test("helpers", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-12.4), "-$12");
});
