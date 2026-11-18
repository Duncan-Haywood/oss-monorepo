// Interval coverage and bias of every estimator, on populations simulated
// under each model (run: node eval/coverage.mjs > eval/coverage-output.txt).
// Seeded, so the output is reproducible.
import { analyze } from "../engine.mjs";

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261118);
// Beta(a, b) by two gammas (Marsaglia-Tsang, shape >= 1).
function gamma(a) {
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = rand(), u2 = rand(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
const beta = (a, b) => { const x = gamma(a); return x / (x + gamma(b)); };

function simulate(N, k, prob) {
  const hs = [];
  for (let i = 0; i < N; i++) {
    const pi = prob.animal ? prob.animal() : null;
    let seen = false;
    const h = [];
    for (let j = 0; j < k; j++) {
      const p = pi ?? (seen && prob.c != null ? prob.c : Array.isArray(prob.p) ? prob.p[j] : prob.p);
      const x = rand() < p ? 1 : 0;
      h.push(x);
      seen = seen || x === 1;
    }
    if (h.includes(1)) hs.push(h);
  }
  return hs;
}

const SCENARIOS = [
  { name: "M0: N=200, k=4, p=0.2", N: 200, k: 4, prob: { p: 0.2 } },
  { name: "Mt: N=200, k=4, p=0.10/0.30/0.20/0.25", N: 200, k: 4, prob: { p: [0.1, 0.3, 0.2, 0.25] } },
  { name: "Mb (trap-shy): N=200, k=5, p=0.30, c=0.15", N: 200, k: 5, prob: { p: 0.3, c: 0.15 } },
  { name: "Mh: N=200, k=5, p ~ Beta(2, 6), mean 0.25", N: 200, k: 5, prob: { animal: () => beta(2, 6) } },
  { name: "Two samples: N=500, k=2, p=0.2", N: 500, k: 2, prob: { p: 0.2 } },
];
const REPS = Number(process.argv[2] ?? 1000);

const lines = [`# ${REPS} simulated studies per scenario, 95% intervals; seed 20261118`, "# coverage = share of intervals holding the true N; an unbounded upper limit counts as holding it", "# median and mean relative error of the point estimate; 'none' = share with no finite estimate", ""];
for (const sc of SCENARIOS) {
  const acc = {};
  const add = (key, est, lo, hi) => {
    const a = (acc[key] ??= { n: 0, cover: 0, none: 0, errs: [] });
    a.n++;
    if (est == null) { a.none++; return; }
    if (lo <= sc.N && (hi == null || hi >= sc.N)) a.cover++;
    a.errs.push(est / sc.N - 1);
  };
  for (let rep = 0; rep < REPS; rep++) {
    const hs = simulate(sc.N, sc.k, sc.prob);
    const g = analyze({ histories: hs }).groups[0];
    for (const m of ["M0", "Mt", "Mb"]) add(m, g.models[m].N, g.models[m].lower, g.models[m].upper);
    if (g.best) add("AIC-best", g.models[g.best].N, g.models[g.best].lower, g.models[g.best].upper);
    else add("AIC-best", null);
    add("Chao", g.chao.N, g.chao.lower, g.chao.upper);
    if (g.twoSample) add("Chapman", g.twoSample.N, g.twoSample.lower, g.twoSample.upper);
  }
  lines.push(sc.name);
  lines.push("estimator,coverage_pct,median_rel_err_pct,mean_rel_err_pct,none_pct");
  for (const [key, a] of Object.entries(acc)) {
    const e = a.errs.slice().sort((x, y) => x - y);
    const med = e.length ? e[Math.floor(e.length / 2)] : NaN;
    const mean = e.length ? e.reduce((s, x) => s + x, 0) / e.length : NaN;
    const finite = a.n - a.none;
    lines.push([key, finite ? ((100 * a.cover) / finite).toFixed(1) : "", (100 * med).toFixed(1), (100 * mean).toFixed(1), ((100 * a.none) / a.n).toFixed(1)].join(","));
  }
  lines.push("");
}
console.log(lines.join("\n").trimEnd());
