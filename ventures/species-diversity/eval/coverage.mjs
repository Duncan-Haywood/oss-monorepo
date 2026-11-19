// How often do the intervals hold the truth? Draw samples from assemblages
// whose relative abundances we know, run the analysis, and count.
//   node eval/coverage.mjs [replicates] > eval/coverage-output.txt
// Truths: richness S; E[S(m)] = sum 1 - (1 - p)^m (with-replacement sampling, the
// model the extrapolation assumes); exp(H) and 1 / sum p^2 of the assemblage.
import { analyzeOne, rng } from "../engine.mjs";

const R = Number(process.argv[2] || 300);
const B = 100;

function lognormal(S, sigma, seed) {
  const r = rng(seed);
  const p = [];
  for (let i = 0; i < S; i++) {
    const u1 = r() || 1e-12, u2 = r();
    p.push(Math.exp(sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)));
  }
  const t = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / t);
}

function draw(p, n, r) {
  const cum = [];
  let s = 0;
  for (const x of p) { s += x; cum.push(s); }
  const c = new Array(p.length).fill(0);
  for (let i = 0; i < n; i++) {
    const u = r() * s;
    let lo = 0, hi = p.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
    c[lo]++;
  }
  return c.filter((x) => x > 0);
}

const scenarios = [
  { name: "uneven: 120 species, lognormal sigma 1.5", p: lognormal(120, 1.5, 11), n: 200 },
  { name: "uneven: 120 species, lognormal sigma 1.5", p: lognormal(120, 1.5, 11), n: 800 },
  { name: "even: 40 species, lognormal sigma 0.5", p: lognormal(40, 0.5, 12), n: 100 },
  { name: "even: 40 species, lognormal sigma 0.5", p: lognormal(40, 0.5, 12), n: 400 },
];

console.log(`# ${R} samples per scenario, ${B} bootstrap replicates each, nominal 95% intervals`);
console.log("scenario,n,quantity,truth,mean_estimate,coverage_of_95pct_interval");
for (const sc of scenarios) {
  const { p, n } = sc;
  const S = p.length;
  const H = -p.reduce((a, x) => a + x * Math.log(x), 0);
  const simp = p.reduce((a, x) => a + x * x, 0);
  const Es = (m) => p.reduce((a, x) => a + 1 - (1 - x) ** m, 0);
  const truths = { richness: S, "S(n/2)": Es(n / 2), "S(2n)": Es(2 * n), "exp(H)": Math.exp(H), "1/sum p^2": 1 / simp };
  const hits = Object.fromEntries(Object.keys(truths).map((k) => [k, 0]));
  const sums = Object.fromEntries(Object.keys(truths).map((k) => [k, 0]));
  const r = rng(1000 + n);
  for (let i = 0; i < R; i++) {
    const x = draw(p, n, r);
    const a = analyzeOne("", x, { knots: 5, endpoint: 2 * n, bootstrap: B, seed: i + 1 });
    const at = (m) => a.curve.find((pt) => pt.m === m);
    const got = {
      richness: [a.asymptotic[0].estimate, a.asymptotic[0].lower, a.asymptotic[0].upper],
      "S(n/2)": [at(n / 2).qD[0], at(n / 2).lower[0], at(n / 2).upper[0]],
      "S(2n)": [at(2 * n).qD[0], at(2 * n).lower[0], at(2 * n).upper[0]],
      "exp(H)": [a.asymptotic[1].estimate, a.asymptotic[1].lower, a.asymptotic[1].upper],
      "1/sum p^2": [a.asymptotic[2].estimate, a.asymptotic[2].lower, a.asymptotic[2].upper],
    };
    for (const k of Object.keys(truths)) {
      const [e, lo, hi] = got[k];
      sums[k] += e;
      if (lo <= truths[k] && truths[k] <= hi) hits[k]++;
    }
  }
  for (const k of Object.keys(truths)) console.log([`"${sc.name}"`, n, k, truths[k].toFixed(2), (sums[k] / R).toFixed(2), (hits[k] / R).toFixed(3)].join(","));
}
