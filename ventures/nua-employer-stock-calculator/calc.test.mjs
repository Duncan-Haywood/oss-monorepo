import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, scenario, parse, SAMPLE, sweep, summaryText, sweepCsv } from "./calc.mjs";

const base = { ...SAMPLE };
const raw = (o = {}) => ({ ...base, ...o });

test("NUA is value minus basis and the basis is taxed as ordinary income now", () => {
  const { input } = parse(raw());
  const s = scenario(input);
  assert.equal(s.nua, 400000);
  // age 56, separated at 55+: no 10% additional tax. 100000 * 32%
  assert.equal(s.penaltyApplies, false);
  assert.equal(s.taxNow, 32000);
});

test("under 59.5 without the separation-at-55 exception adds the 10% tax on the basis", () => {
  const a = scenario(parse(raw({ age: 50, separatedAt55: "no" })).input);
  assert.equal(a.penaltyApplies, true);
  assert.equal(a.taxNow, 42000);
  const b = scenario(parse(raw({ age: 50, separatedAt55: "yes" })).input);
  assert.equal(b.penaltyApplies, true, "separation at 55 cannot apply to someone who is 50");
  const c = scenario(parse(raw({ age: 60, separatedAt55: "no" })).input);
  assert.equal(c.penaltyApplies, false);
});

test("zero growth, zero years: NUA net equals value minus tax now minus capital-gains tax on the NUA", () => {
  const s = scenario(parse(raw({ growthPct: 0, years: 0, taxFundPct: 0 })).input);
  assert.equal(s.finalValue, 500000);
  assert.equal(s.saleTax, 60000); // 400000 * 15%
  assert.equal(s.nuaNet, 500000 - 32000 - 60000);
  assert.equal(s.iraNet, 500000 * 0.76);
  assert.ok(s.advantage > 0);
});

test("growth within a year is taxed as ordinary income, after a year as long term", () => {
  const short = scenario(parse(raw({ years: 1, growthPct: 10 })).input);
  const long = scenario(parse(raw({ years: 2, growthPct: 10 })).input);
  // 1 year is not "more than a year": growth taxed at ordinary 32%
  assert.equal(short.saleTax, round(400000 * 0.15 + 50000 * 0.32));
  assert.equal(long.saleTax, round(400000 * 0.15 + (500000 * 1.21 - 500000) * 0.15));
});
function round(n) { return Math.round(n * 100) / 100; }

test("a high basis share and a thin rate gap make the rollover win and say so", () => {
  const r = compute(raw({ basis: 450000, ordinaryPct: 35, ltcgPct: 20, retirementPct: 22, growthPct: 0, years: 0 }));
  assert.ok(r.s.advantage < 0);
  assert.ok(r.findings.some((f) => f.severity === "high" && /rollover leaves you ahead/.test(f.title)));
  assert.ok(r.findings.some((f) => /Cost basis is 90%/.test(f.title)));
});

test("not a lump sum is flagged as losing NUA treatment", () => {
  const r = compute(raw({ lumpSum: "no" }));
  assert.ok(r.findings.some((f) => f.severity === "high" && /lump-sum/.test(f.title)));
});

test("bad input and basis above value produce errors, not numbers", () => {
  assert.ok(compute(raw({ value: "abc" })).errors.length);
  assert.ok(compute(raw({ age: 5 })).errors.length);
  const r = compute(raw({ basis: 600000 }));
  assert.match(r.errors[0], /no net unrealized appreciation/);
});

test("sweep covers six basis shares and the advantage falls as basis rises", () => {
  const sw = sweep(parse(raw()).input);
  assert.equal(sw.length, 6);
  for (let k = 1; k < sw.length; k++) assert.ok(sw[k].advantage <= sw[k - 1].advantage);
});

test("summary and csv render", () => {
  const r = compute(raw());
  assert.match(summaryText(r), /Difference \(NUA minus rollover\)/);
  assert.equal(sweepCsv(r).trim().split("\n").length, 7);
});
