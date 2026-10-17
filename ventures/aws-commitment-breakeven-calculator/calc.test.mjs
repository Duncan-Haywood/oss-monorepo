import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveDiscount, parseProfile, steadyProfile, optimalCoverage, evaluate, stress, curve,
  analyze, sampleText, DEFAULT_OPTIONS, reportCsv, pct, money, HOURS_PER_MONTH,
} from "./calc.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("no upfront or no cost of capital leaves the discount unchanged", () => {
  close(effectiveDiscount({ discount: 0.3, upfrontShare: 0, termMonths: 12, annualRate: 0.1 }), 0.3);
  close(effectiveDiscount({ discount: 0.3, upfrontShare: 1, termMonths: 36, annualRate: 0 }), 0.3);
});

test("paying upfront at a positive cost of capital shrinks the discount, more so for longer terms", () => {
  const one = effectiveDiscount({ discount: 0.3, upfrontShare: 1, termMonths: 12, annualRate: 0.1 });
  const three = effectiveDiscount({ discount: 0.3, upfrontShare: 1, termMonths: 36, annualRate: 0.1 });
  assert.ok(one < 0.3 && three < one);
  // 12-month all-upfront at 10%: PV factor k = 12 / annuity; check against direct sum
  const r = Math.pow(1.1, 1 / 12) - 1;
  let A = 0; for (let m = 1; m <= 12; m++) A += Math.pow(1 + r, -m);
  close(one, 1 - 0.7 * (12 / A));
});

test("a flat profile: commit everything when the discount is positive", () => {
  const v = Array(48).fill(10);
  const o = optimalCoverage(v, 0.3);
  close(o.x, 10);
  const e = evaluate(v, 10, 0.3);
  close(e.savingsPct, 0.3);
  close(e.utilization, 1);
  close(e.commitPerHour, 7);
});

test("the optimum is the d-quantile of usage (closed form)", () => {
  // usage 1..100 once each; d = 0.4 -> cover the 40th value
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  const o = optimalCoverage(v, 0.4);
  assert.ok(o.x >= 39 && o.x <= 41, `x=${o.x}`);
  // brute force over a fine grid never beats it
  const best = evaluate(v, o.x, 0.4).meanCost;
  for (let x = 0; x <= 100; x += 0.5) assert.ok(evaluate(v, x, 0.4).meanCost >= best - 1e-9);
});

test("cost formula: hourly cost = commit + on-demand overflow", () => {
  const v = [2, 4, 6, 8];
  const d = 0.25, x = 5; // commit 3.75/h
  const e = evaluate(v, x, d);
  const expected = (4 * 3.75 + (0 + 0 + 1 + 3)) / 4;
  close(e.meanCost, expected);
  close(e.meanOnDemand, 5);
  close(e.coverage, (2 + 4 + 5 + 5) / 20);
  close(e.utilization, (2 + 4 + 5 + 5) / (5 * 4));
});

test("a zero discount never commits", () => {
  const o = optimalCoverage([1, 5, 9], 0);
  assert.equal(o.x, 0);
});

test("stress: savings fall as usage falls and go negative below the utilization break-even", () => {
  const v = Array(100).fill(10);
  const s = stress(v, 10, 0.3);
  const at = (scale) => s.find((r) => r.scale === scale).savingsPct;
  close(at(1), 0.3);
  assert.ok(at(0.5) < 0, "committing to a flat 10 when usage halves loses money");
  close(at(0.7), 0); // 0.7 usage exactly equals the break-even 1-d
  assert.ok(at(1.3) > 0 && at(1.3) < at(1));
});

test("parseProfile reads plain lists, csv rows with dates, headers and units", () => {
  assert.deepEqual(parseProfile("1.5\n2\n3").values, [1.5, 2, 3]);
  assert.deepEqual(parseProfile("date,cost\n2026-08-01,24\n2026-08-02,48", "day").values, [1, 2]);
  assert.deepEqual(parseProfile("1 2 3").values, [1, 2, 3]);
  const p = parseProfile("5\n-2\n$7\n\n");
  assert.deepEqual(p.values, [5, 7]);
  assert.equal(p.skipped, 1);
});

test("steadyProfile builds a run-share profile the optimizer understands", () => {
  const v = steadyProfile(10, 0.8);
  assert.equal(v.length, 100);
  // 80% of hours running: commit pays off only if 0.8 > 1-d, i.e. d > 0.2
  assert.ok(optimalCoverage(v, 0.3).x === 10);
  assert.ok(optimalCoverage(v, 0.15).x === 0);
});

test("analyze ranks options and reports savings, payback and a downside case", () => {
  const { values } = parseProfile(sampleText());
  assert.equal(values.length, 24 * 28);
  const a = analyze({ values, options: DEFAULT_OPTIONS, annualRate: 0 });
  assert.equal(a.error, undefined);
  assert.equal(a.results.length, 4);
  assert.equal(a.ranked[0], a.best);
  for (const r of a.results) {
    assert.ok(r.savingsPerMonth > 0);
    assert.ok(r.utilization > 0.8 && r.utilization <= 1.0000001);
    close(r.costPerMonth + r.savingsPerMonth, r.onDemandPerMonth, 1e-6);
    close(r.commitPerMonth, r.commitPerHour * HOURS_PER_MONTH);
  }
  const noUp = a.results[0], allUp = a.results[1];
  assert.equal(noUp.paybackMonths, 0);
  assert.ok(allUp.paybackMonths > 0 && allUp.paybackMonths < 12);
  // higher discount -> commit at least as much
  assert.ok(a.results[3].x >= a.results[0].x);
  assert.ok(a.findings.some((f) => /Best option/.test(f.title)));
});

test("cost of capital can flip the ranking away from all-upfront", () => {
  const { values } = parseProfile(sampleText());
  const opts = [
    { label: "no upfront", termMonths: 36, discount: 0.40, upfrontShare: 0 },
    { label: "all upfront", termMonths: 36, discount: 0.43, upfrontShare: 1 },
  ];
  assert.equal(analyze({ values, options: opts, annualRate: 0 }).best.label, "all upfront");
  assert.equal(analyze({ values, options: opts, annualRate: 0.12 }).best.label, "no upfront");
});

test("a tiny discount after cost of capital means no commitment wins", () => {
  const { values } = parseProfile(sampleText());
  const a = analyze({ values, options: [{ label: "meh", termMonths: 12, discount: 0.05, upfrontShare: 1 }], annualRate: 0.2 });
  assert.equal(a.best.x, 0);
  assert.ok(a.findings.some((f) => /No commitment beats/.test(f.title)));
});

test("spiky usage: the recommendation stays well under the peak", () => {
  const v = [...Array(90).fill(2), ...Array(10).fill(50)];
  const a = analyze({ values: v, options: [{ label: "x", termMonths: 12, discount: 0.3, upfrontShare: 0 }] });
  assert.ok(a.best.x <= 2.0001, `x=${a.best.x}`);
  assert.equal(a.peak, 50);
});

test("input validation", () => {
  assert.match(analyze({ values: [1], options: DEFAULT_OPTIONS }).error, /at least two/);
  assert.match(analyze({ values: [0, 0, 0], options: DEFAULT_OPTIONS }).error, /all zero/);
  assert.match(analyze({ values: [1, 2], options: [] }).error, /at least one/);
  assert.match(analyze({ values: [1, 2], options: [{ label: "a", termMonths: 12, discount: 1.2 }] }).error, /between 0% and 95%/);
  assert.match(analyze({ values: [1, 2], options: [{ label: "a", termMonths: 0, discount: 0.3 }] }).error, /Term/);
  assert.match(analyze({ values: [1, 2], options: [{ label: "a", termMonths: 12, discount: 0.3, upfrontShare: 2 }] }).error, /Upfront/);
});

test("short history is flagged; curve peaks at the chosen commitment", () => {
  const a = analyze({ values: [3, 4, 5, 9, 3, 4], options: [DEFAULT_OPTIONS[0]] });
  assert.ok(a.findings.some((f) => /Less than a week/.test(f.title)));
  const { values } = parseProfile(sampleText());
  const d = 0.25;
  const c = curve(values, d, 60);
  const top = c.reduce((m, p) => (p.savingsPct > m.savingsPct ? p : m));
  const o = optimalCoverage(values, d);
  assert.ok(Math.abs(top.x - o.x) <= (c[1].x - c[0].x) + 1e-9);
});

test("csv and formatting helpers", () => {
  const { values } = parseProfile(sampleText());
  const csv = reportCsv(analyze({ values, options: DEFAULT_OPTIONS }));
  assert.equal(csv.trim().split("\n").length, 5);
  assert.match(csv, /^option,term_months/);
  assert.equal(pct(0.256, 1), "25.6%");
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(-5.5), "-$5.5");
});
