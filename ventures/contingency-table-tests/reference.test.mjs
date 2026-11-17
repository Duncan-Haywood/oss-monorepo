import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fisherExact, barnardExact, boschlooExact, chiSquare, effectSizes, fisherRxC, mantelHaenszel, mcnemar } from "./engine.mjs";

// eval/reference.json comes from scipy 1.18.1 and statsmodels 0.15.0 (eval/reference.py).
const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"), (_, v) => (v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v));
const close = (got, want, rel, msg) => {
  if (want === null || want === undefined) return;
  if (!Number.isFinite(want)) return assert.equal(got, want, msg);
  assert.ok(Math.abs(got - want) <= rel * Math.max(1e-12, Math.abs(want)) + 1e-14, `${msg}: got ${got}, want ${want}`);
};
const ALTS = ["two-sided", "less", "greater"];
// Counted on the reference file (eval/reference.py, 69 tables); the README reports them.
const REF_COUNTS = { ties: 22, optimiser: 0 };

test(`Fisher's exact test and the conditional odds ratio match scipy on ${REF.two_by_two.length} tables`, () => {
  for (const c of REF.two_by_two) {
    for (const alt of ALTS) {
      const f = fisherExact(c.table, { alternative: alt });
      close(f.p, c[`fisher_${alt}`], 1e-9, `${JSON.stringify(c.table)} ${alt}`);
      close(f.ci[0], c[`cond_or_ci_${alt}`][0], 1e-6, `ci low ${JSON.stringify(c.table)} ${alt}`);
      close(f.ci[1], c[`cond_or_ci_${alt}`][1], 1e-6, `ci high ${JSON.stringify(c.table)} ${alt}`);
    }
    close(fisherExact(c.table).oddsRatio, c.cond_or, 1e-6, `MLE ${JSON.stringify(c.table)}`);
  }
});

test("Barnard and Boschloo reach the supremum on a dense grid; every scipy shortfall is a rounded-away tie", () => {
  let n = 0;
  const scipyLow = [];
  for (const c of REF.two_by_two) {
    if (!c["barnard_pooled_two-sided"]) continue;
    const [[a, b], [cc, d]] = c.table;
    const checks = [
      ...ALTS.map((alt) => [`barnard ${alt}`, barnardExact(a, a + b, cc, cc + d, { alternative: alt }).p, c[`barnard_pooled_${alt}`]]),
      ["barnard unpooled", barnardExact(a, a + b, cc, cc + d, { pooled: false }).p, c["barnard_unpooled_two-sided"]],
      ...ALTS.map((alt) => [`boschloo ${alt}`, boschlooExact(a, a + b, cc, cc + d, { alternative: alt }).p, c[`boschloo_${alt}`]]),
    ];
    for (const [what, got, ref] of checks) {
      n++;
      // A supremum: ours may beat the 10,001-point grid slightly (golden-section polish), never fall below it.
      assert.ok(got >= ref.sup * (1 - 1e-9) - 1e-15, `${what} ${JSON.stringify(c.table)}: ${got} < grid ${ref.sup}`);
      assert.ok(got <= ref.sup * (1 + 1e-3) + 1e-12, `${what} ${JSON.stringify(c.table)}: ${got} far above grid ${ref.sup}`);
      if (ref.scipy < got * (1 - 1e-6)) scipyLow.push(`${what} ${JSON.stringify(c.table)}`);
    }
  }
  assert.ok(n >= 400, `only ${n} checks`);
  // Where scipy reports less, the cause is one of two, both in scipy's two-sided Barnard: a mirror-image table
  // whose |T| rounds 1 ulp below the observed one (strict grid below the tolerant grid), or shgo stopping
  // below the maximum of its own objective (scipy below the strict grid).
  for (const s of scipyLow) assert.match(s, /^barnard/, s);
  let ties = 0, optimiser = 0;
  for (const c of REF.two_by_two) for (const [k, v] of Object.entries(c)) {
    if (!k.startsWith("barnard") || v.scipy >= v.sup * (1 - 1e-6)) continue;
    if (v.strict < v.sup * (1 - 1e-6)) ties++;
    if (v.scipy < v.strict * (1 - 1e-6)) optimiser++;
    assert.ok(v.strict < v.sup * (1 - 1e-6) || v.scipy < v.strict * (1 - 1e-6), `${k} ${JSON.stringify(c.table)} unexplained`);
  }
  assert.equal(ties + optimiser >= scipyLow.length, true);
  assert.deepEqual({ ties, optimiser }, REF_COUNTS);
  // and every table scipy's >= leaves out is an exact tie in rational arithmetic (eval/reference.py, exact_tie)
  assert.equal(REF.tie_tables_exact, REF.tie_tables);
});

test("chi-square, Yates, G, Woolf, Katz and Newcombe match scipy and statsmodels", () => {
  for (const c of REF.two_by_two) {
    if (c.chi2) {
      const x = chiSquare(c.table), y = chiSquare(c.table, { correct: true });
      close(x.statistic, c.chi2[0], 1e-9, "chi2"); close(x.p, c.chi2[1], 1e-8, "chi2 p");
      close(y.statistic, c.yates[0], 1e-9, "yates"); close(y.p, c.yates[1], 1e-8, "yates p");
      close(x.g, c.g[0], 1e-9, "G"); close(x.gP, c.g[1], 1e-8, "G p");
    }
    const e = effectSizes(c.table);
    if (c.woolf_or_ci) {
      close(e.oddsRatio.ci[0], c.woolf_or_ci[0], 1e-6, "woolf"); close(e.oddsRatio.ci[1], c.woolf_or_ci[1], 1e-6, "woolf");
      close(e.riskRatio.ci[0], c.katz_rr_ci[0], 1e-6, "katz"); close(e.riskRatio.ci[1], c.katz_rr_ci[1], 1e-6, "katz");
    }
    if (c.newcombe) { close(e.riskDifference.newcombe[0], c.newcombe[0], 1e-6, `newcombe ${JSON.stringify(c.table)}`); close(e.riskDifference.newcombe[1], c.newcombe[1], 1e-6, "newcombe"); }
  }
});

test(`r x c exact p-values match plain enumeration on ${REF.rxc.length} tables`, () => {
  for (const c of REF.rxc) {
    close(fisherRxC(c.table).p, c.exact, 1e-9, JSON.stringify(c.table));
    const x = chiSquare(c.table);
    close(x.statistic, c.chi2[0], 1e-9, "chi2"); close(x.p, c.chi2[1], 1e-8, "chi2 p"); assert.equal(x.df, c.chi2[2]);
    if (c.g) close(x.g, c.g[0], 1e-9, "G");
  }
});

test("stratified: CMH, Mantel-Haenszel OR with RGB interval, Breslow-Day and Tarone match statsmodels", () => {
  for (const c of REF.stratified) {
    const s = mantelHaenszel(c.strata), u = mantelHaenszel(c.strata, { correct: false });
    close(s.cmh.statistic, c.cmh_corrected[0], 1e-9, `${c.name} cmh corrected`);
    close(s.cmh.p, c.cmh_corrected[1], 1e-8, `${c.name} cmh p`);
    close(u.cmh.statistic, c.cmh[0], 1e-9, `${c.name} cmh`);
    close(s.commonOR.estimate, c.mh_or, 1e-9, `${c.name} MH OR`);
    close(s.commonOR.ci[0], c.mh_or_ci[0], 1e-6, `${c.name} RGB low`); close(s.commonOR.ci[1], c.mh_or_ci[1], 1e-6, `${c.name} RGB high`);
    if (c.breslow_day) {
      close(s.breslowDay.statistic, c.breslow_day[0], 1e-6, `${c.name} BD`);
      close(s.breslowDay.tarone, c.tarone[0], 1e-6, `${c.name} Tarone`);
      close(s.breslowDay.taroneP, c.tarone[1], 1e-5, `${c.name} Tarone p`);
    }
  }
});

test("McNemar matches statsmodels", () => {
  for (const c of REF.paired.filter((p) => p.table[0][1] + p.table[1][0] > 0)) {
    const m = mcnemar(c.table);
    close(m.exactP, c.exact, 1e-9, "exact"); close(m.corrected, c.corrected[0], 1e-9, "cc"); close(m.correctedP, c.corrected[1], 1e-8, "cc p");
    close(m.chi2, c.chi2[0], 1e-9, "chi2"); close(m.chi2P, c.chi2[1], 1e-8, "chi2 p");
  }
});

test("published values from R's documentation (fisher.test, mantelhaen.test examples)", () => {
  assert.equal(fisherExact([[3, 1], [1, 3]], { alternative: "greater" }).p.toFixed(4), "0.2429");
  assert.equal(fisherExact([[2, 15], [10, 3]], { alternative: "less" }).p.toPrecision(4), "0.0004652");
  assert.equal(fisherRxC([[1, 3, 10, 6], [2, 3, 10, 7], [1, 6, 14, 12], [0, 1, 9, 11]]).p.toFixed(4), "0.7827");
  const rabbits = [[[0, 6], [0, 5]], [[3, 3], [0, 6]], [[6, 0], [2, 4]], [[5, 1], [6, 0]], [[2, 0], [5, 0]]];
  assert.equal(mantelHaenszel(rabbits).cmh.p.toFixed(3), "0.047");
  assert.equal(mantelHaenszel(rabbits).exact.p.toFixed(3), "0.040");
  assert.equal(mantelHaenszel(rabbits, { alternative: "greater" }).exact.p.toFixed(3), "0.020");
});
