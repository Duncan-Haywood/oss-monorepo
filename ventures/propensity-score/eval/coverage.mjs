// Monte Carlo coverage of the 95% intervals on the example's data-generating
// process (eval/simulate.py, redrawn here in JavaScript with its own seeded
// generator). Usage: node eval/coverage.mjs [draws] [n] [seed]
// The population effects follow from the design: E[prior] = 18 (1 - 0.45 x 0.3),
// so ATE = 1 + 1.2 x 0.3 - 0.04 (E[prior] - 15). The ATT is estimated by a
// one-million-unit draw.
import { ipw, regressionAdjustment, aipw, logit, matchNearest } from "../engine.mjs";

const [draws = 500, n = 2000, seed = 7] = process.argv.slice(2).map(Number);

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(seed);
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const bern = (p) => (rand() < p ? 1 : 0);
const gamma4 = () => -Math.log((1 - rand()) * (1 - rand()) * (1 - rand()) * (1 - rand()));

function draw(size) {
  const X = [], d = [], y = [], tau = [];
  for (let i = 0; i < size; i++) {
    const age = 18 + Math.floor(rand() * 38), educ = 8 + Math.floor(rand() * 11), married = bern(0.4), unemp = bern(0.3);
    const prior = gamma4() * 4.5 * (1 - 0.45 * unemp);
    const lin = -0.6 - 0.035 * (age - 35) - 0.15 * (educ - 12) + 0.9 * unemp - 0.06 * (prior - 15) - 0.3 * married;
    const t = bern(1 / (1 + Math.exp(-lin)));
    const tu = 1.0 + 1.2 * unemp - 0.04 * (prior - 15);
    const y0 = 4 + 0.08 * age + 0.55 * educ + 0.75 * prior + 1.2 * married - 1.5 * unemp + 4 * normal();
    X.push([1, age, educ, married, unemp, prior]); d.push(t); y.push(y0 + tu * t); tau.push(tu);
  }
  return { X, d, y, tau };
}

const ATE = 1 + 1.2 * 0.3 - 0.04 * (18 * (1 - 0.45 * 0.3) - 15);
const big = draw(1_000_000);
let s = 0, c = 0;
big.d.forEach((v, i) => { if (v) { s += big.tau[i]; c++; } });
const ATT = s / c;

const tally = {};
const add = (key, r, truth) => {
  const t = (tally[key] ??= { cover: 0, sum: 0, len: 0, n: 0 });
  t.n++; t.sum += r.estimate; t.len += r.ci[1] - r.ci[0];
  if (r.ci[0] <= truth && truth <= r.ci[1]) t.cover++;
};
for (let k = 0; k < draws; k++) {
  const { X, d, y } = draw(n);
  const fit = logit(X, d);
  add("ipw ate", ipw({ X, d, y, estimand: "ate", fit }), ATE);
  add("ra ate", regressionAdjustment({ X, d, y, estimand: "ate" }), ATE);
  add("aipw ate", aipw({ X, d, y, fit }), ATE);
  add("ipw att", ipw({ X, d, y, estimand: "att", fit }), ATT);
  add("ra att", regressionAdjustment({ X, d, y, estimand: "att" }), ATT);
  add("match att", matchNearest({ ps: fit.ps, d, y, estimand: "att", caliper: 0.2 }), ATT);
  add("match1 att", matchNearest({ ps: fit.ps, d, y, estimand: "att", caliper: 0.2, replace: false }), ATT);
}
console.log(`draws ${draws}, n ${n}, seed ${seed}; population ATE ${ATE.toFixed(4)}, ATT ${ATT.toFixed(4)} (1e6 draw)`);
console.log("estimator  mean_estimate  bias  coverage_95  mean_ci_length");
for (const [k, t] of Object.entries(tally)) {
  const truth = k.endsWith("ate") ? ATE : ATT;
  console.log(`${k.padEnd(10)} ${(t.sum / t.n).toFixed(4)} ${(t.sum / t.n - truth).toFixed(4)} ${((100 * t.cover) / t.n).toFixed(1)}% ${(t.len / t.n).toFixed(4)}`);
}
