import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, scenariosCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("net per ceremony follows the stated rule on the sample", () => {
  const r = compute(raw());
  const revenue = 450 + 0.5 * 100;
  const direct = 40 * 0.7 + 15;
  const fixedPer = (150 + 200 + 400) / 30;
  const hours = 1 + 1.5 + 3 + 0.5 * 1;
  assert.ok(Math.abs(r.revenue - revenue) < 0.01);
  assert.ok(Math.abs(r.netPer - (revenue - direct - fixedPer)) < 0.01);
  assert.ok(Math.abs(r.hours - hours) < 0.01);
  assert.ok(Math.abs(r.hourly - r.netPer / hours) < 0.01);
  assert.ok(Math.abs(r.yearNet - r.netPer * 30) < 0.05);
});

test("the minimum fee reaches the target hourly pay", () => {
  const r = compute(raw({ targetHourly: "80" }));
  const again = compute(raw({ fee: String(r.minFee), targetHourly: "80" }));
  assert.ok(Math.abs(again.hourly - 80) < 0.01);
});

test("more ceremonies spread fixed costs", () => {
  assert.ok(compute(raw({ ceremonies: "60" })).netPer > compute(raw({ ceremonies: "10" })).netPer);
});

test("break-even ceremonies cover fixed costs", () => {
  const r = compute(raw());
  const contribution = r.revenue - r.direct;
  assert.equal(r.breakEvenCeremonies, Math.ceil(750 / contribution));
});

test("fee scenarios are sorted, include the plan, and raise pay", () => {
  const r = compute(raw());
  assert.ok(r.scenarios.some((s) => s.fee === 450));
  assert.ok(r.scenarios.every((s, i, a) => i === 0 || (s.fee > a[i - 1].fee && s.hourly > a[i - 1].hourly)));
  const lines = scenariosCsv(r).split("\n");
  assert.equal(lines[0], "fee,net_per_ceremony,hourly_pay,yearly_net");
  assert.equal(lines.length, r.scenarios.length + 1);
});

test("a low fee below target is flagged high and names the fee that fixes it", () => {
  const r = compute(raw({ fee: "150", targetHourly: "60" }));
  const f = r.findings.find((x) => x.severity === "high");
  assert.ok(f);
  assert.match(f.title, new RegExp(dollars(r.minFee).replace(/[$.]/g, "\\$&")));
});

test("bad input is rejected with a message, never NaN", () => {
  assert.ok(compute(raw({ fee: "" })).errors.length);
  assert.ok(compute(raw({ ceremonies: "0" })).errors.length);
  assert.ok(compute(raw({ rehearsalShare: "150" })).errors.length);
  assert.ok(compute(raw({ miles: "-5" })).errors.length);
  const r = compute(raw({ consultHours: "", scriptHours: "", rehearsalHours: "", miles: "", licenseYear: "", insuranceYear: "", listingsYear: "", suppliesEvent: "", targetHourly: "" }));
  assert.equal(r.errors.length, 0);
  assert.ok(Number.isFinite(r.hourly));
});

test("summary text states the numbers", () => {
  const t = summaryText(compute(raw()));
  assert.match(t, /Wedding officiant/);
  assert.match(t, /Real hourly pay/);
});
