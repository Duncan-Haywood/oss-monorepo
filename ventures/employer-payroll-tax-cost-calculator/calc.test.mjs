import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, SAMPLE, STATES, FED, money } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("sample: FICA, FUTA and SUI follow the caps", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  near(r.ss, 52000 * 0.062);
  near(r.medicare, 52000 * 0.0145);
  near(r.futa, 42); // 7000 x 0.6%
  near(r.sui, 243); // 9000 x 2.7%
  near(r.compCost, 780);
  near(r.matchCost, 1560);
  near(r.healthCost, 5400);
  near(r.total, 52000 + r.burden);
});

test("Social Security stops at the wage base; Medicare does not", () => {
  const r = compute({ ...SAMPLE, salary: 300000 });
  near(r.ss, FED.ssBase * 0.062);
  near(r.medicare, 300000 * 0.0145);
  assert.ok(r.findings.some((f) => /Social Security wage base/.test(f.title)));
});

test("mid-year hire prorates wages, health months and keeps caps on actual wages", () => {
  const r = compute({ ...SAMPLE, months: 3 });
  near(r.wages, 13000);
  near(r.healthCost, 1350);
  near(r.futa, 42); // 13000 > 7000 so still capped
  const short = compute({ ...SAMPLE, salary: 12000, months: 6 });
  near(short.wages, 6000);
  near(short.futa, 36); // 6000 x 0.6%, under the cap
  near(short.sui, 162);
});

test("credit reduction raises the FUTA rate on the first $7,000 only", () => {
  const r = compute({ ...SAMPLE, creditReduction: 1.2 });
  near(r.futa, 7000 * 0.018);
  assert.ok(r.findings.some((f) => /credit reduction/.test(f.title)));
});

test("hires multiply the total and zero-rate inputs are accepted", () => {
  const r = compute({ ...SAMPLE, hires: 4, comp: 0, health: 0, match: 0 });
  near(r.totalAll, r.total * 4);
  near(r.compCost + r.healthCost + r.matchCost, 0);
});

test("bad input is rejected with a message, never clamped", () => {
  for (const bad of [{ state: "" }, { salary: 0 }, { months: 13 }, { months: 2.5 }, { suiRate: -1 }, { creditReduction: 6 }, { hires: "" }, { salary: "abc" }]) {
    const r = compute({ ...SAMPLE, ...bad });
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
  }
  assert.ok(parse(undefined).errors.length > 0);
});

test("every state preset computes and carries positive base and rate", () => {
  for (const id of Object.keys(STATES)) {
    const r = compute({ ...SAMPLE, state: id, suiBase: STATES[id].base, suiRate: STATES[id].rate * 100 });
    assert.deepEqual(r.errors, [], id);
    assert.ok(STATES[id].base > 0 && STATES[id].rate > 0);
  }
});

test("summary names the sources and the total", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /Verify against/);
  assert.match(t, /Total employer cost per hire/);
  assert.match(money(1234.5), /\$1,23[45]/);
});
