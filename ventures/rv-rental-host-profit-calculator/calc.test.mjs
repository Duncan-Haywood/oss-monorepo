import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("cash and after-depreciation results follow the stated rule on the sample", () => {
  const r = compute(raw());
  const trips = 70 / 4;
  const keep = 0.8;
  const revenue = 195 * 70 + 80 * trips;
  const variable = 60 * trips + 18 * 70;
  const fixed = 1800 + 100 * 12 + 450 * 12 + 600;
  const cash = revenue * keep - variable - fixed;
  assert.ok(Math.abs(r.cash - cash) < 0.01);
  assert.ok(Math.abs(r.afterDepreciation - (cash - 3500)) < 0.01);
  assert.equal(r.trips, trips);
});

test("fee, cleaning and wear lines add up to the cash result", () => {
  const r = compute(raw());
  assert.ok(Math.abs(r.revenue - r.fee - r.cleaning - r.wear - r.fixed - r.cash) < 0.01);
});

test("break-even nights give zero profit, break-even rate gives zero profit at the same nights", () => {
  const r = compute(raw());
  const n = compute(raw({ nights: String(r.breakEvenNights), available: "365" }));
  assert.ok(Math.abs(n.afterDepreciation) < 1);
  const rate = compute(raw({ rate: String(r.breakEvenRate) }));
  assert.ok(Math.abs(rate.afterDepreciation) < 1);
  const tr = compute(raw({ rate: String(r.targetRate) }));
  assert.ok(Math.abs(tr.afterDepreciation - 3000) < 1);
});

test("a loss at cash level is a high finding; depreciation-only loss is medium", () => {
  assert.equal(compute(raw({ nights: "20" })).findings[0].severity, "high");
  const r = compute(raw());
  assert.ok(r.cash > 0 && r.afterDepreciation < 0);
  assert.equal(r.findings[0].severity, "medium");
});

test("break-even above available nights is flagged and rate is the way out", () => {
  const r = compute(raw({ rate: "100", available: "120", nights: "100" }));
  assert.ok(r.findings.some((f) => /cannot pay for itself/.test(f.title)));
});

test("no contribution per night means break-even nights are unreachable", () => {
  const r = compute(raw({ rate: "10" }));
  assert.equal(r.breakEvenNights, null);
  assert.match(summaryText(r), /not reachable/);
});

test("higher platform fee lowers profit", () => {
  assert.ok(compute(raw({ feePct: "30" })).cash < compute(raw({ feePct: "10" })).cash);
});

test("optional fields can be blank", () => {
  const r = compute(raw({ available: "", cleanFeeCharged: "", cleanCost: "", wearPerNight: "", feePct: "", insurance: "", storageMonth: "", loanMonth: "", otherFixed: "", depreciation: "", target: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.input.available, 365);
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ rate: "" })).errors[0].includes("nightly"));
  assert.ok(compute(raw({ nights: "0" })).errors.length > 0);
  assert.ok(compute(raw({ avgTrip: "0" })).errors.length > 0);
  assert.ok(compute(raw({ nights: "250" })).errors.length > 0);
  assert.ok(compute(raw({ feePct: "70" })).errors.length > 0);
  assert.ok(compute(raw({ insurance: "-1" })).errors.length > 0);
});

test("sweep rises with nights and never exceeds available nights", () => {
  const s = compute(raw()).sweep;
  assert.equal(s.length, 5);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].cash > s[i - 1].cash);
  assert.ok(compute(raw({ nights: "190" })).sweep.every((x) => x.nights <= 200));
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(-1234.5), "-$1,234.50");
  assert.match(summaryText(r), /Break-even: /);
  assert.equal(sweepCsv(r).split("\n").length, 6);
});
