// Coverage by simulation: how often does each 95% interval for the pooled effect contain the
// true mean, and how much of the true-effect distribution does the prediction interval cover?
//   node eval/coverage.mjs [reps]     (seeded; writes eval/coverage.json)
// Each record has k studies with true effects theta_i ~ N(0, tau2) and within-study variances
// v_i drawn uniformly from [0.01, 0.25] (log-ratio scale, a few hundred participants a study),
// so the typical I-squared runs from about 30% (tau2 = 0.05) to about 65% (tau2 = 0.2).
import { writeFileSync } from "node:fs";
import { fitModel, rng, normalDraw, normCdf, tQuantile } from "../engine.mjs";

const reps = Number(process.argv[2] || 2000);
const settings = [];
for (const k of [5, 10, 20]) for (const tau2 of [0.05, 0.2]) settings.push({ k, tau2 });

const out = [];
for (const s of settings) {
  const u = rng(1000 * s.k + Math.round(s.tau2 * 100));
  const hit = { dlWald: 0, remlWald: 0, remlHK: 0 };
  let piCover = 0, widthWald = 0, widthHK = 0, i2 = 0;
  for (let r = 0; r < reps; r++) {
    const v = Array.from({ length: s.k }, () => 0.01 + 0.24 * u());
    const y = v.map((vi) => Math.sqrt(s.tau2) * normalDraw(u) + Math.sqrt(vi) * normalDraw(u));
    const X = y.map(() => [1]);
    const dl = fitModel(y, v, X, { method: "DL" }).coefs[0];
    const fit = fitModel(y, v, X, { method: "REML" });
    const re = fit.coefs[0];
    if (dl.lower <= 0 && dl.upper >= 0) hit.dlWald++;
    if (re.lower <= 0 && re.upper >= 0) hit.remlWald++;
    if (re.hk.lower <= 0 && re.hk.upper >= 0) hit.remlHK++;
    widthWald += re.upper - re.lower;
    widthHK += re.hk.upper - re.hk.lower;
    i2 += fit.heterogeneity.I2fromQ;
    // Share of the true-effect distribution N(0, tau2) inside the prediction interval.
    const half = tQuantile(0.975, s.k - 2) * Math.sqrt(fit.tau2 + re.se * re.se);
    const sd = Math.sqrt(s.tau2);
    piCover += normCdf((re.estimate + half) / sd) - normCdf((re.estimate - half) / sd);
  }
  out.push({
    k: s.k, tau2: s.tau2, reps,
    meanI2: i2 / reps,
    dlWald: hit.dlWald / reps, remlWald: hit.remlWald / reps, remlHK: hit.remlHK / reps,
    widthRatioHKtoWald: widthHK / widthWald,
    predictionCoverage: piCover / reps,
  });
}
writeFileSync(new URL("./coverage.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.table(out.map((o) => ({ k: o.k, tau2: o.tau2, I2: o.meanI2.toFixed(2), "DL Wald": o.dlWald.toFixed(3), "REML Wald": o.remlWald.toFixed(3), "REML HK": o.remlHK.toFixed(3), "HK/Wald width": o.widthRatioHKtoWald.toFixed(2), "PI coverage": o.predictionCoverage.toFixed(3) })));
