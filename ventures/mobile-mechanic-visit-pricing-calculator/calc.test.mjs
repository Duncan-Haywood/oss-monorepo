import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("price follows the stated time-share rule on the sample", () => {
  const r = compute(raw());
  const paid = 200 * 0.9, dayRev = (9000 + 70000) / paid, dayMin = 9 * 60;
  const trip = (dayRev * 45 / dayMin + 20 * 0.8) / 0.97;
  const job = (dayRev * 50 / dayMin + 60) / 0.97;
  assert.ok(Math.abs(r.price - (trip + 3 * job)) < 0.01);
  assert.ok(Math.abs(r.tripCharge - trip) < 0.01);
  assert.ok(Math.abs(r.jobRate - job) < 0.01);
  assert.equal(r.stopMinutes, 195);
});

test("pricing the target income for a year really pays it", () => {
  const r = compute(raw({ currentPerJob: "" }));
  const back = compute(raw({ currentPerJob: String(r.price / 3 - 60 * 1.3) }));
  assert.ok(Math.abs(back.current.takeHome - 70000) < 200);
});

test("break-even is below the target price", () => {
  const r = compute(raw());
  assert.ok(r.breakEven < r.price);
});

test("a low flat per-job rate is flagged with the take-home gap", () => {
  const r = compute(raw({ currentPerJob: "30" }));
  assert.ok(r.current.takeHome < 70000);
  assert.ok(r.findings.some((f) => /take home about/.test(f.title)));
});

test("a rate above the target price raises no shortfall finding", () => {
  const r = compute(raw({ currentPerJob: "400" }));
  assert.ok(r.current.takeHome > 70000);
  assert.ok(!r.findings.some((f) => f.severity !== "info"));
});

test("one-job stops cost more per job than big stops", () => {
  const s = compute(raw()).sweep;
  assert.equal(s[0].n, 1);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].perJob < s[i - 1].perJob);
});

test("more lost days raise the price", () => {
  assert.ok(compute(raw({ lostPct: "30" })).price > compute(raw({ lostPct: "0" })).price);
});

test("optional fields can be blank", () => {
  const r = compute(raw({ setupMin: "", miles: "", costPerMile: "", materials: "", markup: "", lostPct: "", feePct: "", currentPerJob: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.current, null);
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ jobs: "" })).errors[0].includes("jobs per typical stop"));
  assert.ok(compute(raw({ lostPct: "100" })).errors.length > 0);
  assert.ok(compute(raw({ feePct: "60" })).errors.length > 0);
  assert.ok(compute(raw({ dayHours: "0" })).errors.length > 0);
  assert.match(compute(raw({ jobs: "20" })).errors[0], /more than a 9-hour day/);
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(1234.5), "$1,234.50");
  assert.match(summaryText(r), /trip charge \$/);
  assert.equal(sweepCsv(r).split("\n").length, r.sweep.length + 1);
});

test("parts markup splits each job into parts and labor without changing the total", () => {
  const a = compute(raw({ markup: "0" })), b = compute(raw({ markup: "50" }));
  assert.equal(a.price, b.price);
  assert.ok(Math.abs(b.partsPrice - 90) < 0.01);
  assert.ok(Math.abs(b.laborRate - (b.jobRate - 90)) < 0.01);
  assert.ok(b.laborRate < a.laborRate);
});
