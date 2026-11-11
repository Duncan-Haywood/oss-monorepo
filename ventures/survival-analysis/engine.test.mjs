import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, kaplanMeier, logRank, coxFit, concordance, gammaQ, chiSquareP, normalQuantile, normalP, eventCoding, parseCsv, rmst, quantileTime, PAPERS } from "./engine.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const REF = JSON.parse(read("./eval/reference.json"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const csvFor = (name) => (name === "leukemia" ? read("./data/leukemia.csv") : read(`./eval/cases/${name}.csv`));
const inf = (v) => (v === "Infinity" ? Infinity : v);

test("special functions match known values", () => {
  close(chiSquareP(3.841458820694124, 1), 0.05, 1e-10, "chi2 1 df at 3.84");
  close(chiSquareP(5.991464547107979, 2), 0.05, 1e-10, "chi2 2 df at 5.99");
  close(chiSquareP(11.070497693516351, 5), 0.05, 1e-10, "chi2 5 df at 11.07");
  close(chiSquareP(0.5, 3), 0.9188914116, 1e-8, "chi2 3 df at 0.5 (lower-tail series)");
  close(normalQuantile(0.975), 1.959963984540054, 1e-12, "z 0.975");
  close(normalQuantile(0.95), 1.6448536269514722, 1e-12, "z 0.95");
  close(normalQuantile(0.025), -1.959963984540054, 1e-12, "z 0.025");
  close(normalP(1.959963984540054), 0.05, 1e-10, "two-sided p");
  close(gammaQ(1, 2), Math.exp(-2), 1e-13, "Q(1,x) = exp(-x)");
  close(normalP(40), 0, 1e-300, "far tail");
});

test("Kaplan-Meier by hand on a tiny sample with a tie and censoring", () => {
  // times 1,2,2,3+,4,5+ : S(1)=5/6, S(2)=5/6*2/4... n at risk 5 at t=2 with 2 events
  const km = kaplanMeier([1, 2, 2, 3, 4, 5], [1, 1, 1, 0, 1, 0]);
  assert.deepEqual(km.map((r) => r.time), [1, 2, 3, 4, 5]);
  assert.deepEqual(km.map((r) => r.atRisk), [6, 5, 3, 2, 1]);
  close(km[0].survival, 5 / 6, 1e-15, "S(1)");
  close(km[1].survival, (5 / 6) * (3 / 5), 1e-15, "S(2)");
  close(km[3].survival, (5 / 6) * (3 / 5) * (1 / 2), 1e-15, "S(4)");
  // Greenwood: S^2 * (1/(6*5) + 2/(5*3))
  close(km[1].se, km[1].survival * Math.sqrt(1 / 30 + 2 / 15), 1e-15, "Greenwood");
  assert.equal(quantileTime(km, 0.5), 2);
  close(rmst(km, 5), 1 + (5 / 6) * 1 + 0.5 * 2 + 0.25 * 1, 1e-15, "area under the steps");
  assert.equal(quantileTime(kaplanMeier([1, 2], [0, 0]), 0.5), Infinity);
});

for (const [name, c] of Object.entries(REF.cases)) {
  const csv = csvFor(name);
  const r = analyze({ csv, time: c.time, event: c.event, group: c.group, covariates: c.covariates });
  const lookup = (g, key) => new Map(c.groups[g].times.map((t, i) => [t, c.groups[g][key][i]]));

  test(`${name}: Kaplan-Meier curves, bands, medians and RMST match lifelines`, () => {
    assert.equal(r.error, undefined, r.error);
    assert.deepEqual(r.groups.map((g) => g.name).sort(), Object.keys(c.groups).sort());
    close(r.tau, c.tau, 0, "tau");
    for (const g of r.groups) {
      const S = lookup(g.name, "survival"), lo = lookup(g.name, "lo"), hi = lookup(g.name, "hi");
      for (const row of g.km) {
        assert.ok(S.has(row.time), `${g.name} t=${row.time} missing from lifelines timeline`);
        close(row.survival, S.get(row.time), 1e-12, `${g.name} S(${row.time})`);
        if (lo.get(row.time) !== null && row.survival > 0 && row.survival < 1) {
          close(row.lo, lo.get(row.time), 1e-9, `${g.name} lower band at ${row.time}`);
          close(row.hi, hi.get(row.time), 1e-9, `${g.name} upper band at ${row.time}`);
        }
      }
      const ref = c.groups[g.name];
      assert.equal(g.median, inf(ref.median), `${g.name} median`);
      assert.equal(g.medianLo, inf(ref.median_lo), `${g.name} median lower`);
      assert.equal(g.medianHi, inf(ref.median_hi), `${g.name} median upper`);
      close(g.rmst, ref.rmst, 1e-10, `${g.name} RMST`);
    }
  });

  test(`${name}: log-rank matches lifelines; weighted tests match statsmodels`, () => {
    close(r.logrank.chiSquare, c.logrank.chi_square, 1e-10, "log-rank chi-square");
    close(r.logrank.p, c.logrank.p, 1e-8, "log-rank p");
    assert.equal(r.logrank.df, c.logrank.df);
    const k = r.groups.length;
    const idx = new Map(r.groups.map((g, i) => [g.name, i]));
    const rows = parseCsv(csv);
    const cols = rows.columns;
    const time = rows.rows.map((x) => Number(x[cols.indexOf(c.time)]));
    const ev = rows.rows.map((x) => Number(x[cols.indexOf(c.event)]));
    const grp = rows.rows.map((x) => idx.get(x[cols.indexOf(c.group)]));
    for (const [t, ref] of Object.entries(c.statsmodels_survdiff)) {
      const mine = logRank(time, ev, grp, k, { test: t });
      close(mine.chiSquare, ref.chi_square, 1e-9, `${t} chi-square`);
      close(mine.p, ref.p, 1e-7, `${t} p`);
    }
  });

  test(`${name}: Cox model matches lifelines and statsmodels (Efron), statsmodels (Breslow)`, () => {
    const L = c.cox_efron_lifelines;
    assert.deepEqual(r.cox.terms.map((t) => t.name), L.names);
    r.cox.terms.forEach((t, a) => {
      close(t.coef, c.cox_efron_statsmodels.coef[a], 1e-8, `${t.name} coef vs statsmodels`);
      close(t.se, c.cox_efron_statsmodels.se[a], 1e-7, `${t.name} se vs statsmodels`);
      // lifelines stops Newton-Raphson at a looser tolerance than statsmodels, so it
      // agrees with both to about 1e-4 while statsmodels and this engine agree to 1e-8.
      close(t.coef, L.coef[a], 1e-4, `${t.name} coef vs lifelines`);
      close(t.se, L.se[a], 1e-4, `${t.name} se vs lifelines`);
      close(t.p, L.p[a], 1e-4, `${t.name} p vs lifelines`);
      close(t.ph.chiSquare, L.ph_km_chi_square[a], 1e-3, `${t.name} PH test vs lifelines`);
      close(t.ph.p, L.ph_km_p[a], 1e-3, `${t.name} PH p vs lifelines`);
    });
    close(r.cox.logLik, c.cox_efron_statsmodels.log_lik, 1e-10, "log-likelihood");
    close(r.cox.lr.chiSquare, L.lr, 1e-6, "likelihood-ratio test");
    close(r.cox.concordance, L.concordance, 1e-6, "Harrell's C");
    const b = analyze({ csv, time: c.time, event: c.event, group: c.group, covariates: c.covariates, ties: "breslow" }).cox;
    b.terms.forEach((t, a) => {
      close(t.coef, c.cox_breslow_statsmodels.coef[a], 1e-8, `${t.name} Breslow coef`);
      close(t.se, c.cox_breslow_statsmodels.se[a], 1e-7, `${t.name} Breslow se`);
    });
    close(b.logLik, c.cox_breslow_statsmodels.log_lik, 1e-10, "Breslow log-likelihood");
  });
}

test("leukemia: pinned values for the example (Freireich 1963 remission data)", () => {
  const r = analyze({ csv: read("./data/leukemia.csv"), group: "treatment" });
  assert.equal(r.columns.time, "weeks");
  assert.equal(r.columns.event, "relapsed");
  assert.deepEqual(r.logrank.observed, [9, 21]);
  close(r.logrank.expected[0], 19.25, 1e-3, "expected relapses on 6-MP");
  close(r.logrank.chiSquare, 16.79, 1e-3, "log-rank 16.79");
  const t = r.cox.terms[0];
  close(t.coef, 1.572, 1e-3, "Efron coefficient 1.572");
  close(t.hr, 4.817, 1e-3, "hazard ratio 4.82");
  close(r.cox.lr.chiSquare, 16.35, 1e-3, "LR 16.35");
  close(r.cox.wald.chiSquare, 14.53, 1e-3, "Wald 14.53");
  close(r.cox.score.chiSquare, 17.25, 1e-3, "score 17.25");
  // Tied relapse times make the Efron score test close to, not equal to, the log-rank statistic.
  assert.ok(Math.abs(r.cox.score.chiSquare - r.logrank.chiSquare) < 0.5);
  assert.match(r.summary, /6-MP \(21 subjects, 9 events\): half had the event by 23 \(95% CI 13 to not reached\)/);
  assert.match(r.summary, /placebo \(21 subjects, 21 events\): half had the event by 8 \(95% CI 4 to 11\)/);
});

test("with no tied event times the Cox score test of one binary covariate is the log-rank test", () => {
  // A textbook identity (Cox 1972; e.g. Klein & Moeschberger sec. 8.3): exact when no two events share a time.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const time = [], ev = [], g = [];
  for (let i = 0; i < 60; i++) { g.push(i % 2); time.push(i + 1 + rnd() * 0.5); ev.push(rnd() < 0.7 ? 1 : 0); }
  const lr = logRank(time, ev, g, 2);
  for (const ties of ["breslow", "efron"]) {
    const cox = coxFit(time, ev, g.map((v) => [v]), ["g"], { ties });
    close(cox.score.chiSquare, lr.chiSquare, 1e-10, `${ties} score = log-rank`);
  }
});

test("properties: relabelling groups, rescaling and shifting covariates, row order", () => {
  const csv = read("./eval/cases/ties3.csv");
  const base = analyze({ csv, group: "arm", covariates: "x1,x2", reference: "arm0" });
  const lines = csv.trim().split("\n");
  const reversed = [lines[0], ...lines.slice(1).reverse()].join("\n");
  const rev = analyze({ csv: reversed, group: "arm", covariates: "x1,x2", reference: "arm0" });
  close(rev.logrank.chiSquare, base.logrank.chiSquare, 1e-12, "row order");
  const byName = new Map(base.cox.terms.map((t) => [t.name, t.coef]));
  for (const t of rev.cox.terms) close(t.coef, byName.get(t.name), 1e-9, `row order ${t.name}`);
  // x1 * 10 + 3 divides its coefficient by 10 and leaves the rest alone.
  const scaled = [lines[0], ...lines.slice(1).map((l) => { const f = l.split(","); f[3] = String(Number(f[3]) * 10 + 3); return f.join(","); })].join("\n");
  const s = analyze({ csv: scaled, group: "arm", covariates: "x1,x2", reference: "arm0" });
  close(s.cox.terms[2].coef * 10, base.cox.terms[2].coef, 1e-7, "rescaled x1");
  close(s.cox.terms[3].coef, base.cox.terms[3].coef, 1e-7, "x2 unchanged");
  close(s.cox.lr.chiSquare, base.cox.lr.chiSquare, 1e-8, "LR unchanged");
  // A different reference group flips the sign of a two-group contrast.
  const two = analyze({ csv: read("./data/leukemia.csv"), group: "treatment", reference: "placebo" });
  close(two.cox.terms[0].coef, -1.5721, 1e-4, "reference flips sign");
  assert.equal(two.cox.terms[0].name, "treatment=6-MP vs placebo");
});

test("concordance: perfect, reversed and all-tied scores", () => {
  const t = [1, 2, 3, 4, 5], e = [1, 1, 1, 1, 1];
  assert.equal(concordance(t, e, [5, 4, 3, 2, 1]).c, 1);
  assert.equal(concordance(t, e, [1, 2, 3, 4, 5]).c, 0);
  assert.equal(concordance(t, e, [0, 0, 0, 0, 0]).c, 0.5);
  // Censored at the same time as an event counts as outliving it; two tied events are not compared.
  const tied = concordance([2, 2, 2], [1, 1, 0], [3, 2, 1]);
  assert.equal(tied.pairs, 2);
});

test("event coding: words, 1/2 as in R, an explicit value, and a clear error", () => {
  assert.equal(eventCoding(["yes", "no", "Yes"]).map("Yes"), 1);
  const r12 = eventCoding(["1", "2", "2"]);
  assert.equal(r12.map("2"), 1);
  assert.equal(r12.map("1"), 0);
  assert.match(r12.note, /2 = event/);
  assert.equal(eventCoding(["cancelled", "renewed"], "cancelled").map("cancelled"), 1);
  assert.match(eventCoding(["cancelled", "renewed"]).error, /must say which rows had the event/);
  assert.match(eventCoding(["a"], "b").error, /never appears/);
});

test("input errors are readable", () => {
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "1,0\n2,1" }).error, /header/);
  assert.match(analyze({ csv: "a,b\n1,0" }).error, /Choose the time column/);
  assert.match(analyze({ csv: "time,event\n-1,1\n2,1" }).error, /negative/);
  assert.match(analyze({ csv: "time,event\n1,0\n2,0" }).error, /every subject is censored/);
  assert.match(analyze({ csv: "time,event,g\n1,1,a\n2,1,b", group: "zz" }).error, /not in the header/);
  assert.match(analyze({ csv: "time,event\n1,1\n2,1", confidence: 2 }).error, /Confidence/);
  assert.match(analyze({ csv: "time,event\n1,1\n2,1", ties: "exact" }).error, /efron/);
  assert.match(analyze({ csv: "time,event\nx,1\n2,1" }).error, /must hold numbers/);
  const missing = analyze({ csv: "time,event\n1,1\n,1\n3,0\n4,1" });
  assert.equal(missing.rows.dropped, 1);
  assert.match(missing.warnings.join(" "), /1 row with a missing value/);
});

test("separation is warned about, not hidden", () => {
  // Everyone with x=1 fails before anyone with x=0: the MLE is infinite.
  const csv = "time,event,x\n" + Array.from({ length: 20 }, (_, i) => `${i + 1},1,${i < 10 ? 1 : 0}`).join("\n");
  const r = analyze({ csv, covariates: "x" });
  assert.ok(r.warnings.some((w) => /monotone|did not settle|infinite/.test(w)), r.warnings.join(" | "));
});

test("a single group gives a curve and RMST but no test or Cox model", () => {
  const r = analyze({ csv: read("./data/leukemia.csv") });
  assert.equal(r.groups.length, 1);
  assert.equal(r.logrank, null);
  assert.equal(r.cox, null);
  assert.equal(r.groups[0].n, 42);
  assert.match(r.summary, /42 subjects, 30 events/);
});

test("PAPERS are complete enough to cite", () => {
  assert.ok(PAPERS.length >= 6);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
});
