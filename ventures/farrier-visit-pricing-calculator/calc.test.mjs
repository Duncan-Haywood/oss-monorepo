import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("price follows the stated time-share rule on the sample", () => {
  const r = compute(raw());
  const paid = 200 * 0.9, dayRev = (9000 + 70000) / paid, dayMin = 9 * 60;
  const trip = (dayRev * 45 / dayMin + 20 * 0.8) / 0.97;
  const horse = (dayRev * 50 / dayMin + 18) / 0.97;
  assert.ok(Math.abs(r.price - (trip + 3 * horse)) < 0.01);
  assert.ok(Math.abs(r.tripCharge - trip) < 0.01);
  assert.ok(Math.abs(r.horseRate - horse) < 0.01);
  assert.equal(r.stopMinutes, 195);
});

test("pricing the target income for a year really pays it", () => {
  const r = compute(raw({ currentPerHorse: "" }));
  const back = compute(raw({ currentPerHorse: String(r.price / 3) }));
  assert.ok(Math.abs(back.current.takeHome - 70000) < 200);
});

test("break-even is below the target price", () => {
  const r = compute(raw());
  assert.ok(r.breakEven < r.price);
});

test("a low flat per-horse rate is flagged with the take-home gap", () => {
  const r = compute(raw({ currentPerHorse: "40" }));
  assert.ok(r.current.takeHome < 70000);
  assert.ok(r.findings.some((f) => /take home about/.test(f.title)));
});

test("a rate above the target price raises no shortfall finding", () => {
  const r = compute(raw({ currentPerHorse: "200" }));
  assert.ok(r.current.takeHome > 70000);
  assert.ok(!r.findings.some((f) => f.severity !== "info"));
});

test("one-horse stops cost more per horse than big stops", () => {
  const s = compute(raw()).sweep;
  assert.equal(s[0].n, 1);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].perHorse < s[i - 1].perHorse);
});

test("more lost days raise the price", () => {
  assert.ok(compute(raw({ lostPct: "30" })).price > compute(raw({ lostPct: "0" })).price);
});

test("optional fields can be blank", () => {
  const r = compute(raw({ setupMin: "", miles: "", costPerMile: "", materials: "", lostPct: "", feePct: "", currentPerHorse: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.current, null);
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ horses: "" })).errors[0].includes("horses per typical stop"));
  assert.ok(compute(raw({ lostPct: "100" })).errors.length > 0);
  assert.ok(compute(raw({ feePct: "60" })).errors.length > 0);
  assert.ok(compute(raw({ dayHours: "0" })).errors.length > 0);
  assert.match(compute(raw({ horses: "20" })).errors[0], /more than a 9-hour day/);
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(1234.5), "$1,234.50");
  assert.match(summaryText(r), /trip charge \$/);
  assert.equal(sweepCsv(r).split("\n").length, r.sweep.length + 1);
});
