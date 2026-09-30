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
