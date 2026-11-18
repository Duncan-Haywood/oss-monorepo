// Monte Carlo coverage of the 95% intervals on the example's design (eval/simulate.py),
// redrawn in JavaScript, at the example's instrument strength and with the instruments'
// first-stage effects scaled down to make them weak.
//   node eval/coverage.mjs [reps=500] [seed=11]   (writes nothing; coverage-output.txt is its stdout)
import { buildDesign, invert, cross, kClass, limlKappa, firstStage, andersonRubinSet } from "../engine.mjs";

const reps = Number(process.argv[2] || 500), seed = Number(process.argv[3] || 11);
function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(seed);
const normal = () => { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
const bern = (p) => (R() < p ? 1 : 0);
const BETA = 0.08;

function draw(strength, abilityWage = 0.12) {
  const G = 150, per = 20, rows = [];
  for (let g = 1; g <= G; g++) {
    const near = bern(0.45), tuition = 2 + 7 * R(), urban = bern(0.6), south = bern(0.35), shock = 0.1 * normal();
    for (let i = 0; i < per; i++) {
      const black = bern(0.15), ability = normal(), exper = 1 + Math.floor(25 * R());
      const latent = 12.6 + 0.9 * ability + strength * (0.7 * near - 0.18 * (tuition - 5.5)) - 0.5 * black + 0.4 * urban - 0.3 * south + 1.6 * normal();
      const educ = Math.min(20, Math.max(8, Math.round(latent)));
      const sd = 0.28 + 0.008 * exper;
      const lw = 1.1 + BETA * educ + 0.045 * exper - 0.0008 * exper * exper - 0.14 * black - 0.09 * south + 0.15 * urban + abilityWage * ability + shock + sd * normal();
      rows.push({ county: String(g), log_wage: lw, education_years: educ, experience: exper, experience_sq: exper * exper, black, south, urban, college_nearby: near, tuition });
    }
  }
  return rows;
}

const spec = { outcome: "log_wage", endogenous: ["education_years"], instruments: ["college_nearby", "tuition"], exogenous: ["experience", "experience_sq", "black", "south", "urban"], cluster: "county" };
const lines = [`Coverage of 95% intervals for the return to schooling (true ${BETA}); ${reps} draws of 3,000 people in 150 counties, seed ${seed}, clustered by county.`];
for (const [label, strength, abilityWage] of [["example strength", 1, 0.12], ["weak (first-stage effects x 0.3)", 0.3, 0.12], ["weak (x 0.3) and strongly endogenous (ability effect on wages 0.12 -> 0.6)", 0.3, 0.6]]) {
  const acc = { ols: [], tsls: [], liml: [], fuller: [], ar: [], ard: [] }, Fs = [];
  const t0 = Date.now();
  for (let r = 0; r < reps; r++) {
    const d = buildDesign(draw(strength, abilityWage), spec);
    const opts = { se: "clustered", clusters: d.clusters, debiased: false, alpha: 0.05 };
    const ZZinv = invert(cross(d.Z, d.Z));
    const j = d.exog.length;
    const kL = limlKappa(d, ZZinv);
    const fits = { ols: kClass({ y: d.y, X: d.X, Z: d.X, k: 0, ...opts }), tsls: kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, ZZinv, ...opts }), liml: kClass({ y: d.y, X: d.X, Z: d.Z, k: kL, ZZinv, ...opts }), fuller: kClass({ y: d.y, X: d.X, Z: d.Z, k: kL - 1 / (d.n - d.kz), ZZinv, ...opts }) };
    for (const [m, f] of Object.entries(fits)) acc[m].push({ est: f.beta[j], cover: f.ci[j][0] <= BETA && BETA <= f.ci[j][1], len: f.ci[j][1] - f.ci[j][0] });
    for (const [key, deb] of [["ar", false], ["ard", true]]) {
      const set = andersonRubinSet(d, fits.tsls, { ...opts, debiased: deb }, 0.05);
      const len = set.intervals.reduce((s, [a, b]) => s + (b - a), 0);
      acc[key].push({ est: NaN, cover: set.intervals.some(([a, b]) => a <= BETA && BETA <= b), len, kind: set.kind });
    }
    Fs.push(firstStage(d, opts)[0].effectiveF);
  }
  Fs.sort((a, b) => a - b);
  lines.push("", `${label}: median effective first-stage F ${Fs[Math.floor(reps / 2)].toFixed(1)} (10th-90th percentile ${Fs[Math.floor(reps * 0.1)].toFixed(1)} to ${Fs[Math.floor(reps * 0.9)].toFixed(1)}); ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  lines.push("| Interval | Median estimate | Median bias | Coverage | Median length (AR: bounded intervals only) |", "|---|---|---|---|---|");
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  for (const [m, name] of [["ols", "OLS, clustered Wald"], ["tsls", "2SLS, clustered Wald"], ["liml", "LIML, clustered Wald"], ["fuller", "Fuller (a = 1), clustered Wald"], ["ar", "Anderson-Rubin set, clustered"], ["ard", "Anderson-Rubin set, clustered, small-sample factor"]]) {
    const a = acc[m];
    const cov = a.filter((x) => x.cover).length / reps;
    const isAR = m.startsWith("ar");
    const e = isAR ? "n/a" : med(a.map((x) => x.est)).toFixed(4), b = isAR ? "n/a" : (med(a.map((x) => x.est)) - BETA).toFixed(4);
    const L = med(a.filter((x) => !isAR || x.kind === "interval").map((x) => x.len));
    const kinds = {};
    for (const x of a) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
    const extra = isAR ? ` (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")})` : "";
    lines.push(`| ${name} | ${e} | ${b} | ${(100 * cov).toFixed(1)}% | ${Number.isFinite(L) ? L.toFixed(4) : "unbounded"}${extra} |`);
  }
}
lines.push("", `Monte Carlo standard error of a coverage near 95%: ${(100 * Math.sqrt(0.95 * 0.05 / reps)).toFixed(1)} points.`);
console.log(lines.join("\n"));
