import { test } from "node:test";
import assert from "node:assert/strict";
import { normCdf, normInv, sampleSize, daysToRun, srmCheck, mixtureSequential, peekingInflation, bayes, analyze, sampleText, reportCsv, pct, signedPct } from "./calc.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b}`);

test("normal CDF and inverse match published values", () => {
  near(normCdf(1.96), 0.9750021, 1e-6);
  near(normCdf(0), 0.5, 1e-12);
  near(normCdf(-1), 0.1586553, 1e-6);
  near(normInv(0.975), 1.959964, 1e-5);
  near(normInv(0.8), 0.841621, 1e-5);
  assert.ok(Number.isNaN(normInv(0)));
});

test("sample size matches the standard two-proportion formula", () => {
  // 20% -> 25%, alpha .05 two-sided, power .8: ~1,090-1,100 per arm.
  const r = sampleSize({ baseline: 0.2, mde: 0.05, mode: "absolute" });
  assert.ok(r.perArm >= 1085 && r.perArm <= 1100, String(r.perArm));
  assert.equal(r.total, r.perArm * 2);
  // Relative 10% on a 5% baseline needs about 31k per arm.
  const s = sampleSize({ baseline: 0.05, mde: 0.1 });
  assert.ok(s.perArm > 30500 && s.perArm < 32000, String(s.perArm));
  // Higher power and smaller effects need more traffic.
  assert.ok(sampleSize({ baseline: 0.05, mde: 0.1, power: 0.9 }).perArm > s.perArm);
  assert.ok(sampleSize({ baseline: 0.05, mde: 0.05 }).perArm > s.perArm);
});

test("sample size rejects impossible inputs", () => {
  assert.ok(sampleSize({ baseline: 0, mde: 0.1 }).error);
  assert.ok(sampleSize({ baseline: 0.5, mde: 0 }).error);
  assert.ok(sampleSize({ baseline: 0.9, mde: 0.2, mode: "absolute" }).error);
});

test("days to run rounds up and handles no traffic", () => {
  assert.deepEqual(daysToRun(2188, 300), { days: 8, weeks: 2 });
  assert.equal(daysToRun(1000, 0), null);
});

test("sample ratio mismatch flags lopsided splits only", () => {
  assert.equal(srmCheck(5000, 5000).p, 1);
  assert.ok(srmCheck(5000, 4500).p < 0.001);
  assert.ok(srmCheck(10050, 9950).p > 0.05);
  near(srmCheck(700, 300, 0.7).p, 1, 1e-9);
});

test("two-proportion z-test on the worked example", () => {
  const a = analyze({ n1: 10000, c1: 520, n2: 10000, c2: 578 });
  near(a.p1, 0.052, 1e-12);
  near(a.diff, 0.0058, 1e-12);
  near(a.z, 1.8005, 1e-3);
  near(a.p, 0.0718, 1e-3);
  assert.equal(a.significant, false);
  assert.ok(a.ci.low < 0 && a.ci.high > 0);
  near(a.relative, 0.1115, 1e-3);
  assert.ok(a.relativeCi.low < 0 && a.relativeCi.high > 0.2);
});

test("clear winners are significant on every method", () => {
  const a = analyze({ n1: 10000, c1: 500, n2: 10000, c2: 650 });
  assert.ok(a.p < 0.001 && a.significant);
  assert.ok(a.ci.low > 0);
  assert.ok(a.bayes.probBBeatsA > 0.999);
  assert.ok(a.sequential.significant);
});

test("identical groups are not significant and Bayesian stays near a coin flip", () => {
  const a = analyze({ n1: 4000, c1: 200, n2: 4000, c2: 200 });
  assert.equal(a.p, 1);
  near(a.bayes.probBBeatsA, 0.5, 0.03);
  assert.equal(a.sequential.significant, false);
});

test("Bayesian results are deterministic and internally consistent", () => {
  const x = bayes(520, 10000, 578, 10000), y = bayes(520, 10000, 578, 10000);
  assert.deepEqual(x, y);
  near(x.probBBeatsA, 0.9666, 0.01);
  assert.ok(x.liftLow < x.liftMedian && x.liftMedian < x.liftHigh);
  assert.ok(x.expectedLossChoosingB < x.expectedLossChoosingA);
});

test("Bayesian probability agrees with the z-test on large samples", () => {
  const a = analyze({ n1: 50000, c1: 2500, n2: 50000, c2: 2650 });
  near(a.bayes.probBBeatsA, normCdf(a.z), 0.01);
});

test("always-valid intervals are wider than fixed ones and p is never below the fixed p when peeking matters", () => {
  const a = analyze({ n1: 10000, c1: 520, n2: 10000, c2: 578 });
  assert.ok(a.sequential.high - a.sequential.low > a.ci.high - a.ci.low);
  assert.ok(a.sequential.p >= a.p);
  const s = mixtureSequential(0.04, 0.0001, 0.01);
  assert.ok(s.p < 0.05 && s.low > 0);
});

test("peeking inflates the false-positive rate as Armitage tabulated", () => {
  near(peekingInflation(1), 0.05, 1e-12);
  near(peekingInflation(2), 0.083, 0.012);
  near(peekingInflation(5), 0.142, 0.012);
  near(peekingInflation(10), 0.193, 0.012);
});

test("always-valid test holds its level under repeated peeking (simulation)", () => {
  let seed = 99, falsePos = 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sims = 300;
  for (let s = 0; s < sims; s++) {
    let c1 = 0, c2 = 0, n = 0, hit = false;
    for (let look = 1; look <= 20 && !hit; look++) {
      for (let i = 0; i < 250; i++) { n++; if (rand() < 0.1) c1++; if (rand() < 0.1) c2++; }
      const p1 = c1 / n, p2 = c2 / n, v = (p1 * (1 - p1) + p2 * (1 - p2)) / n;
      if (v > 0 && mixtureSequential(p2 - p1, v, 0.01).p < 0.05) hit = true;
    }
    if (hit) falsePos++;
  }
  assert.ok(falsePos / sims < 0.06, `false positive rate ${falsePos / sims}`);
});

test("SRM produces a high-severity finding and peeking a warning", () => {
  const a = analyze({ n1: 5000, c1: 100, n2: 4500, c2: 100, looks: 6 });
  assert.equal(a.findings[0].severity, "high");
  assert.match(a.findings[0].title, /Sample ratio mismatch/);
  assert.ok(a.findings.some((f) => /Checking 6 times/.test(f.title)));
  assert.ok(a.inflated > 0.1);
});

test("small counts get a warning", () => {
  const a = analyze({ n1: 300, c1: 10, n2: 300, c2: 20 });
  assert.ok(a.findings.some((f) => f.title === "Few conversions"));
});

test("zero conversions do not crash and relative lift is null", () => {
  const a = analyze({ n1: 100, c1: 0, n2: 100, c2: 0 });
  assert.equal(a.p, 1);
  assert.equal(a.relative, null);
  const b = analyze({ n1: 100, c1: 0, n2: 100, c2: 5 });
  assert.equal(b.relative, null);
  assert.ok(Number.isFinite(b.p));
});

test("bad input returns an error rather than NaN", () => {
  assert.ok(analyze({ n1: 100, c1: 101, n2: 100, c2: 5 }).error);
  assert.ok(analyze({ n1: 0, c1: 0, n2: 100, c2: 5 }).error);
  assert.ok(analyze({ n1: 1.5, c1: 1, n2: 100, c2: 5 }).error);
  assert.ok(analyze({ n1: 100, c1: 1, n2: 100, c2: 5, alpha: 0.9 }).error);
  assert.ok(analyze({ n1: 100, c1: 1, n2: 100, c2: 5, controlShare: 1 }).error);
  assert.ok(analyze({}).error);
});

test("sample data, CSV and formatters", () => {
  const a = analyze(sampleText());
  const csv = reportCsv(a);
  assert.match(csv, /^metric,value\n/);
  assert.match(csv, /p_value,0\.07/);
  assert.equal(pct(0.0523), "5.23%");
  assert.equal(signedPct(0.111), "+11.1%");
  assert.equal(signedPct(NaN), "n/a");
});

import { priceTest, priceSampleText, money } from "./calc.mjs";

test("price test compares revenue per visitor and finds the break-even conversion", () => {
  const r = priceTest(priceSampleText());
  near(r.rpv1, 1.16, 1e-9);
  near(r.rpv2, 0.0345 * 39, 1e-9);
  near(r.diff, 0.0345 * 39 - 1.16, 1e-9);
  // $29 -> $39 can lose up to 25.6% of buyers before revenue per visitor falls.
  near(r.breakEvenRelativeDrop, 1 - 29 / 39, 1e-12);
  near(r.breakEvenRate, (0.04 * 29) / 39, 1e-12);
  assert.ok(r.conversionChange < 0 && r.diff > 0);
  assert.ok(r.findings.some((f) => f.title === "Fewer buyers, more revenue"));
  // Delta-method z-test against the hand calculation.
  const se = Math.sqrt((29 ** 2 * 0.04 * 0.96) / 4000 + (39 ** 2 * 0.0345 * 0.9655) / 4000);
  near(r.se, se, 1e-12);
  near(r.z, r.diff / se, 1e-9);
  near(r.p, 2 * normCdf(-Math.abs(r.z)), 1e-9);
  assert.ok(r.ci.low < r.diff && r.diff < r.ci.high);
});

test("price test Bayesian view agrees with the sign of the evidence and is reproducible", () => {
  const a = priceTest(priceSampleText());
  const b = priceTest(priceSampleText());
  assert.deepEqual(a.bayes, b.bayes);
  assert.ok(a.bayes.probBBeatsA > 0.5 && a.bayes.probBBeatsA < 1);
  assert.ok(a.bayes.liftLow < a.bayes.liftMedian && a.bayes.liftMedian < a.bayes.liftHigh);
  // Swapping the arms mirrors the probability.
  const s = priceTest({ n1: 4000, c1: 138, price1: 39, n2: 4000, c2: 160, price2: 29 });
  near(a.bayes.probBBeatsA + s.bayes.probBBeatsA, 1, 0.02);
  // A clearly losing higher price is flagged.
  const bad = priceTest({ n1: 20000, c1: 800, price1: 29, n2: 20000, c2: 400, price2: 39 });
  assert.ok(bad.significant && bad.diff < 0);
  assert.ok(bad.findings.some((f) => f.severity === "high"));
});

test("price test validates input and reports monthly impact", () => {
  assert.match(priceTest({ n1: 100, c1: 5, price1: 10, n2: 100, c2: 5, price2: 10 }).error, /same/);
  assert.match(priceTest({ n1: 100, c1: 5, price1: 0, n2: 100, c2: 5, price2: 10 }).error, /greater than zero/);
  assert.match(priceTest({ n1: 100, c1: 105, price1: 5, n2: 100, c2: 5, price2: 10 }).error, /exceed/);
  assert.match(priceTest({ n1: 0, c1: 0, price1: 5, n2: 100, c2: 5, price2: 10 }).error, /at least one/);
  const r = priceTest({ ...priceSampleText(), monthlyVisitors: 10000 });
  near(r.monthly.revenueDelta, r.diff * 10000, 1e-9);
  assert.equal(money(1.2346), "$1.235");
  assert.equal(money(-12.5), "-$12.50");
});

test("always-valid interval stays sane when the control rate is near zero", () => {
  const r = analyze({ n1: 50, c1: 0, n2: 50, c2: 5 });
  assert.ok(r.priorSd >= 0.04, "default prior is not tighter than the standard error");
  assert.ok(r.sequential.high - r.sequential.low < 1, "interval is narrower than the whole 0-1 range");
});

import { multiTest, parseArms, multiSampleText } from "./calc.mjs";

test("A/B/n: Holm adjusts p-values and never lowers them", () => {
  const { arms } = parseArms(multiSampleText());
  const r = multiTest({ arms });
  assert.equal(r.rows.length, 3);
  for (const x of r.rows) { assert.ok(x.pHolm >= x.p && x.pHolm <= 1); }
  // Smallest raw p is multiplied by the number of variants.
  const min = r.rows.reduce((a, b) => (a.p < b.p ? a : b));
  near(min.pHolm, Math.min(1, min.p * 3), 1e-12);
  // Best-arm probabilities sum to one.
  near(r.control.probBest + r.rows.reduce((s, x) => s + x.probBest, 0), 1, 1e-9);
});

test("A/B/n: a clear winner is found and identical arms are not", () => {
  const win = multiTest({ arms: [{ name: "A", n: 10000, c: 500 }, { name: "B", n: 10000, c: 700 }, { name: "C", n: 10000, c: 505 }] });
  assert.equal(win.winners[0].name, "B");
  assert.equal(win.rows[1].significant, false);
  const same = multiTest({ arms: [{ name: "A", n: 1000, c: 50 }, { name: "B", n: 1000, c: 50 }, { name: "C", n: 1000, c: 50 }] });
  assert.equal(same.winners.length, 0);
  assert.equal(same.rows[0].pHolm, 1);
});

test("A/B/n: rejects bad input and parses lines", () => {
  assert.ok(multiTest({ arms: [{ name: "A", n: 10, c: 1 }, { name: "B", n: 10, c: 1 }] }).error);
  assert.ok(multiTest({ arms: [{ name: "A", n: 10, c: 1 }, { name: "B", n: 10, c: 11 }, { name: "C", n: 10, c: 1 }] }).error);
  assert.ok(parseArms("A, 100").error);
  assert.deepEqual(parseArms("Big, red, 100, 5\n\nB,200,9\n").arms, [{ name: "Big, red", n: 100, c: 5 }, { name: "B", n: 200, c: 9 }]);
});
