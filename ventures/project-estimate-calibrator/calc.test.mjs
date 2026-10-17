import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, conformalQuantile, fitModel, lossChance, analyze, sampleText, reportCsv } from "./calc.mjs";

// Deterministic simulated history: actual = estimate * exp(mu + sigma * z) [* size drift].
function history({ n = 400, mu = 0.22, sigma = 0.3, seed = 9, drift = 0 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: n }, () => {
    const est = 6 + rnd() * 140;
    return { est, act: est * Math.exp(mu + sigma * gauss() + drift * Math.log(est / 40)) };
  });
}

test("parseRows reads headers in any order, units, money, types, and skips bad rows", () => {
  const p = parseRows("Actual,Type,Estimate\n\"1,200\",web,1000\n900,web,800\nx,web,5\n0,web,4");
  assert.deepEqual(p.rows[0], { est: 1000, act: 1200, type: "web" });
  assert.equal(p.rows.length, 2);
  assert.match(p.warnings[0], /2 rows skipped/);
  const q = parseRows("10 hrs,14 hrs\n20h,21h");
  assert.deepEqual(q.rows, [{ est: 10, act: 14 }, { est: 20, act: 21 }]);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("a,b\nx,y").error);
});

test("conformal quantile picks the ceil((n+1)p)-th value and flags a p that n cannot support", () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(conformalQuantile(s, 0.8), { value: 8, capped: false });
  assert.deepEqual(conformalQuantile(s, 0.95), { value: 9, capped: true });
});

test("recovers the true overrun and spread from a large simulated history", () => {
  const h = history();
  const m = fitModel(h.map((r) => r.est), h.map((r) => r.act));
  assert.equal(m.sized, false);
  assert.equal(m.b, 1);
  assert.ok(Math.abs(m.a - 0.22) < 0.05, `a=${m.a}`);
  const r = analyze(h, { estimate: 40 });
  assert.ok(Math.abs(r.medianMult - Math.exp(0.22)) < 0.06, `median ${r.medianMult}`);
  const trueP80 = Math.exp(0.22 + 0.8416 * 0.3);
  assert.ok(Math.abs(r.p80Mult - trueP80) < 0.09, `p80 ${r.p80Mult} vs ${trueP80}`);
  assert.ok(r.p80Mult > r.medianMult);
  assert.ok(r.p80Range80[0] <= r.p80Mult && r.p80Mult <= r.p80Range80[1]);
});

test("the P80 is calibrated: about 80% of fresh projects land at or under it", () => {
  const train = history({ n: 200, seed: 3 });
  const fresh = history({ n: 2000, seed: 77 });
  const m = fitModel(train.map((r) => r.est), train.map((r) => r.act));
  const s = [...m.res].sort((a, b) => a - b);
  const q = conformalQuantile(s, 0.8).value;
  const hit = fresh.filter((r) => Math.log(r.act) <= m.a + m.b * Math.log(r.est) + q).length / fresh.length;
  assert.ok(Math.abs(hit - 0.8) < 0.05, `coverage ${hit}`);
});

test("a size trend in overruns is detected and used; a flat history is not", () => {
  const h = history({ n: 300, drift: 0.25, sigma: 0.2 });
  const m = fitModel(h.map((r) => r.est), h.map((r) => r.act));
  assert.equal(m.sized, true);
  assert.ok(Math.abs(m.b - 1.25) < 0.1, `b=${m.b}`);
  const r = analyze(h, { estimate: 120 });
  assert.ok(r.warnings.some((w) => /change with size/.test(w)));
  const small = analyze(h, { estimate: 10 });
  assert.ok(small.p80Mult < r.p80Mult, "bigger projects overrun more");
});

test("refuses tiny histories and histories with no miss to measure", () => {
  assert.match(analyze(history({ n: 8 })).error, /At least 12/);
  const exact = Array.from({ length: 30 }, (_, i) => ({ est: 10 + i, act: 10 + i }));
  assert.match(analyze(exact).error, /matched your estimates/);
});

test("small samples cap the 95% level and say so; 12-24 projects warn", () => {
  const r = analyze(history({ n: 15 }), { estimate: 30 });
  assert.ok(r.warnings.some((w) => /95% level cannot/.test(w)));
  assert.ok(r.warnings.some((w) => /Only 15 projects/.test(w)));
  assert.equal(r.verdict, "weak");
});

test("an estimate outside the past range is flagged as extrapolation", () => {
  const r = analyze(history({ n: 100 }), { estimate: 5000 });
  assert.equal(r.outside, true);
  assert.ok(r.warnings.some((w) => /extrapolation/.test(w)));
});

test("a fixed price at the P80 level loses money about 20% of the time; a cheaper one more often", () => {
  const h = history({ n: 300 });
  const r = analyze(h, { estimate: 50, rate: 100, price: 50 * 100 });
  assert.ok(r.proposal.lossChance > 0.6, `loss at the plain estimate ${r.proposal.lossChance}`);
  const p80 = r.scenarios.find((s) => s.p === 0.8);
  assert.ok(Math.abs(p80.lossChance - 0.2) < 0.06, `loss at p80 ${p80.lossChance}`);
  const more = analyze(h, { estimate: 50, rate: 100, price: p80.price * 1.4 });
  assert.ok(more.proposal.lossChance < p80.lossChance);
  assert.ok(more.proposal.expectedOverrun < r.proposal.expectedOverrun);
  assert.ok(r.proposal.breakEvenMultiple === 1);
});

test("lossChance never claims zero", () => {
  const h = history({ n: 40 });
  const m = fitModel(h.map((r) => r.est), h.map((r) => r.act));
  assert.ok(lossChance(m, 50, 1e9, 1) > 0);
});

test("back-test on a stationary history covers near 80% and beats 'actual = estimate'", () => {
  const r = analyze(history({ n: 400 }), { estimate: 40 });
  assert.ok(r.holdout.helps);
  assert.ok(Math.abs(r.holdout.coverage80 - 0.8) < 0.12, `cov ${r.holdout.coverage80}`);
  assert.equal(r.verdict, "usable");
});

test("when estimates are already unbiased the back-test does not claim a gain", () => {
  const r = analyze(history({ n: 300, mu: 0 }), { estimate: 40 });
  assert.equal(r.holdout.helps, false);
  assert.equal(r.verdict, "calibrated");
});

test("per-type overruns need 5 projects per type and are ordered worst first", () => {
  const r = analyze(parseRows(sampleText()).rows, { estimate: 40 });
  assert.ok(r.byType.length >= 3);
  assert.equal(r.byType[0].type, "app feature");
  for (let i = 1; i < r.byType.length; i++) assert.ok(r.byType[i - 1].medianRatio >= r.byType[i].medianRatio);
  const few = analyze(history({ n: 30 }).map((x, i) => ({ ...x, type: "t" + i })), { estimate: 30 });
  assert.equal(few.byType.length, 0);
  assert.ok(few.warnings.some((w) => /none has 5 or more/.test(w)));
});

test("results are reproducible, the sample runs, and the CSV has one row per level", () => {
  const rows = parseRows(sampleText()).rows;
  const a = analyze(rows, { estimate: 40, rate: 90, price: 4000 }), b = analyze(rows, { estimate: 40, rate: 90, price: 4000 });
  assert.deepEqual(a.p80Range80, b.p80Range80);
  assert.equal(rows.length, 60);
  assert.ok(a.medianRatio > 1.1 && a.medianRatio < 1.5);
  const csv = reportCsv(a).trim().split("\n");
  assert.equal(csv.length, 1 + a.scenarios.length);
  assert.match(csv[0], /^chance_actual/);
});

test("a price without a rate is explained rather than silently ignored", () => {
  const r = analyze(history({ n: 60 }), { estimate: 40, price: 4000 });
  assert.equal(r.proposal, null);
  assert.ok(r.warnings.some((w) => /hourly cost or rate/.test(w)));
});
