// How often do the intervals cover the true reliability? Seeded simulation.
//   node eval/coverage.mjs [reps=300] [bootstrap=300]  -> eval/coverage.json
// Data: k = 6 items from a one-factor model with normal errors. "tau-equivalent": every
// loading 0.6 (alpha = omega = the reliability of the sum). "congeneric": loadings
// 0.2, 0.3, 0.4, 0.8, 0.85, 0.9 (alpha < omega = reliability). Each interval is scored against the true
// reliability of the unweighted sum, (sum l)^2 / ((sum l)^2 + sum psi).
import { writeFileSync } from "node:fs";
import { analyze, rng } from "../engine.mjs";

const reps = Number(process.argv[2] || 300);
const B = Number(process.argv[3] || 300);
if (!(Number.isInteger(reps) && reps > 0 && Number.isInteger(B) && B > 0)) {
  console.error("usage: node eval/coverage.mjs [reps=300] [bootstrap=300]");
  process.exit(2);
}
const designs = {
  "tau-equivalent": [0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
  congeneric: [0.2, 0.3, 0.4, 0.8, 0.85, 0.9],
};
const out = [];
for (const [name, l] of Object.entries(designs)) {
  const psi = l.map((x) => 1 - x * x);
  const s = l.reduce((a, b) => a + b, 0);
  const truth = (s * s) / (s * s + psi.reduce((a, b) => a + b, 0));
  const C = l.map((a, i) => l.map((b, j) => a * b + (i === j ? psi[i] : 0)));
  const popAlpha = (6 / 5) * (1 - C.reduce((t, r, i) => t + r[i], 0) / C.flat().reduce((a, b) => a + b, 0));
  for (const n of [50, 200, 1000]) {
    const R = rng(1000 + n + (name === "congeneric" ? 7 : 0));
    const gauss = () => Math.sqrt(-2 * Math.log(R() || 1e-300)) * Math.cos(2 * Math.PI * R());
    const hit = { feldt: 0, alphaBca: 0, omegaBca: 0, omegaPct: 0 };
    let done = 0, alphaSum = 0, omegaSum = 0;
    for (let r = 0; r < reps; r++) {
      const rows = Array.from({ length: n }, () => { const f = gauss(); return l.map((li, i) => li * f + Math.sqrt(psi[i]) * gauss()); });
      const csv = `q1,q2,q3,q4,q5,q6\n${rows.map((x) => x.join(",")).join("\n")}`;
      const a = analyze({ csv, bootstrap: B, seed: r + 1 });
      done++;
      alphaSum += a.alpha.value;
      omegaSum += a.omega.value;
      if (a.alpha.lower <= truth && truth <= a.alpha.upper) hit.feldt++;
      if (a.alpha.bootstrap.lower <= truth && truth <= a.alpha.bootstrap.upper) hit.alphaBca++;
      if (a.omega.bootstrap.lower <= truth && truth <= a.omega.bootstrap.upper) hit.omegaBca++;
      if (a.omega.bootstrap.percentileLower <= truth && truth <= a.omega.bootstrap.percentileUpper) hit.omegaPct++;
    }
    const row = { design: name, n, k: 6, reps: done, bootstrap: B, reliability: truth, populationAlpha: popAlpha, meanAlpha: alphaSum / done, meanOmega: omegaSum / done, coverage: Object.fromEntries(Object.entries(hit).map(([k, v]) => [k, v / done])) };
    out.push(row);
    console.log(JSON.stringify(row));
  }
}
writeFileSync(new URL("./coverage.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
writeFileSync(new URL("../coverage-data.mjs", import.meta.url), `// Written by eval/coverage.mjs; a copy of eval/coverage.json for the page.\nexport const COVERAGE = ${JSON.stringify(out)};\n`);
