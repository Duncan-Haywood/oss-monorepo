import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, CBAM_FACTOR, SAMPLE, summaryText, ladderCsv, GOODS, num } from "./calc.mjs";

const base = (over = {}) => ({ year: "2026", eua: "80", originPrice: "0", defaults: "no", lines: [{ good: "steel-bf", tonnes: "100", intensity: "2", benchmark: "1.3", value: "" }], ...over });

test("2026: 97.5% of free allocation is still deducted", () => {
  const r = compute(base());
  // embedded 200; free = 100*1.3*(1-0.025)=126.75; certs 73.25; cost 5860
  assert.equal(r.certificates, 73.25);
  assert.equal(r.totalCost, 5860);
  assert.equal(r.costPerTonne, 58.6);
});

test("2034: no free allocation left, full embedded emissions are charged", () => {
  const r = compute(base({ year: "2034" }));
  assert.equal(r.certificates, 200);
  assert.equal(r.totalCost, 16000);
});

test("cost never falls with later years when price is flat", () => {
  const r = compute(base());
  for (let i = 1; i < r.ladder.length; i++) assert.ok(r.ladder[i].cost >= r.ladder[i - 1].cost);
});

test("certificates floor at zero when benchmark exceeds intensity", () => {
  const r = compute(base({ lines: [{ good: "steel-bf", tonnes: "100", intensity: "1", benchmark: "1.3" }] }));
  assert.equal(r.certificates, 0);
  assert.equal(r.totalCost, 0);
});

test("carbon price paid abroad is deducted and capped at the gross cost", () => {
  const r = compute(base({ originPrice: "20" }));
  assert.equal(r.totalCost, 4395);
  assert.equal(compute(base({ originPrice: "500" })).totalCost, 0);
});

test("default values add the year's mark-up", () => {
  const r = compute(base({ defaults: "yes" }));
  assert.equal(r.markup, 0.1);
  assert.equal(r.lines[0].embedded, 220);
});

test("under 50 tonnes is flagged as likely outside CBAM", () => {
  const r = compute(base({ lines: [{ good: "steel-bf", tonnes: "49", intensity: "", benchmark: "" }] }));
  assert.equal(r.underThreshold, true);
  assert.match(r.findings[0].title, /under the 50 t/);
  assert.equal(compute(base()).underThreshold, false);
});

test("hydrogen mass does not count toward the threshold", () => {
  const r = compute(base({ lines: [{ good: "hydrogen", tonnes: "500", intensity: "", benchmark: "" }] }));
  assert.equal(r.underThreshold, true);
});

test("blank intensity falls back to the preset and says so", () => {
  const r = compute(base({ lines: [{ good: "alu-primary", tonnes: "60", intensity: "", benchmark: "" }] }));
  assert.equal(r.lines[0].intensity, GOODS["alu-primary"].intensity);
  assert.ok(r.findings.some((f) => /illustrative/.test(f.title)));
});

test("validation", () => {
  assert.ok(compute(base({ year: "2020" })).errors.length);
  assert.ok(compute(base({ eua: "" })).errors.length);
  assert.ok(compute(base({ lines: [] })).errors.length);
  assert.ok(compute(base({ lines: [{ good: "", tonnes: "5" }] })).errors.length);
  assert.ok(compute(base({ lines: [{ good: "steel-bf", tonnes: "-1" }] })).errors.length);
});

test("comma decimals parse", () => {
  assert.equal(num("1,5"), 1.5);
  assert.equal(compute(base({ eua: "80,5" })).errors.length, 0);
});

test("factors are monotone and end at 100%", () => {
  const v = Object.values(CBAM_FACTOR);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1]);
  assert.equal(CBAM_FACTOR[2034], 1);
});

test("sample runs; summary and csv render", () => {
  const r = compute(SAMPLE);
  assert.equal(r.errors.length, 0);
  assert.ok(r.costPct > 0);
  assert.match(summaryText(r), /CBAM estimate for 2027/);
  assert.equal(ladderCsv(r).trim().split("\n").length, 10);
});
