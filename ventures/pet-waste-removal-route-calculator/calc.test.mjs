import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, sweepCsv, dollars, SAMPLE, VISITS_PER_MONTH } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("profit follows the stated rule on the sample", () => {
  const r = compute(raw());
  const visits = 40 * 52 / 12;
  const margin = 15 * 0.97 - (0.8 + (12 * 25 / 60) * 0.67);
  const expected = visits * margin - 340;
  assert.ok(Math.abs(r.profit - expected) < 0.01);
  assert.ok(Math.abs(r.hours - visits * 20 / 60) < 0.01);
  assert.ok(Math.abs(r.hourly - expected / (visits * 20 / 60)) < 0.01);
});

test("pricing at the target hourly price really pays the target hourly", () => {
  const r = compute(raw());
  const back = compute(raw({ price: String(r.priceForTarget) }));
  assert.ok(Math.abs(back.hourly - 30) < 0.1);
});

test("break-even clients gives zero profit and target clients gives the target", () => {
  const r = compute(raw());
  const at = (c) => compute(raw({ clients: String(c) }));
  assert.ok(r.breakEvenClients > 1 && r.breakEvenClients < 40);
  // Linear in clients, so interpolate on whole clients around the fractional answer.
  const lo = at(Math.floor(r.breakEvenClients)), hi = at(Math.ceil(r.breakEvenClients));
  assert.ok(lo.profit <= 0 && hi.profit >= 0);
  const t = at(Math.ceil(r.clientsForTarget));
  assert.ok(t.profit >= 3000 && t.profit < 3000 + r.clientMargin);
});

test("a loss is flagged high", () => {
  const r = compute(raw({ price: "6" }));
  assert.ok(r.profit < 0);
  assert.equal(r.findings[0].severity, "high");
});

test("a visit that costs more than it earns makes break-even unreachable", () => {
  const r = compute(raw({ price: "2", supplies: "3" }));
  assert.equal(r.breakEvenClients, null);
  assert.ok(r.findings.some((f) => /costs more than it brings in/.test(f.title)));
  assert.match(summaryText(r), /not reachable/);
});

test("long drives are called out and shorter drives raise hourly pay", () => {
  const r = compute(raw({ drive: "25" }));
  assert.ok(r.findings.some((f) => /of each visit is driving/.test(f.title)));
  const s = r.sweep;
  assert.ok(s[0].hourly > s[s.length - 1].hourly);
});

test("sweep covers fixed steps plus the current drive time and is sorted", () => {
  const r = compute(raw({ drive: "12" }));
  assert.deepEqual(r.sweep.map((x) => x.drive), [3, 5, 8, 10, 12, 15, 20, 30]);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines[0], "drive_minutes,hours_per_month,monthly_profit,hourly_pay");
  assert.equal(lines.length, 9);
});

test("optional fields may be blank", () => {
  const r = compute({ clients: "10", price: "20", onsite: "6" });
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.profit - 10 * VISITS_PER_MONTH * 20) < 0.01);
  assert.equal(r.priceForTarget, null);
});

test("bad input is reported, not computed", () => {
  assert.ok(compute(raw({ clients: "0" })).errors.length);
  assert.ok(compute(raw({ clients: "2.5" })).errors.length);
  assert.ok(compute(raw({ price: "abc" })).errors.length);
  assert.ok(compute(raw({ onsite: "0" })).errors.length);
  assert.ok(compute(raw({ badDebt: "60" })).errors.length);
  assert.ok(compute(raw({ drive: "-5" })).errors.length);
});

test("summary and dollars format", () => {
  assert.equal(dollars(-1234.5), "-$1,234.50");
  assert.match(summaryText(compute(raw())), /Pet waste route: 40 weekly clients at \$15\.00 a visit/);
});
