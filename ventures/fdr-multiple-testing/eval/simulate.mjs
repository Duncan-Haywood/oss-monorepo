// Seeded simulation: how each method trades false discoveries for power.
//   node eval/simulate.mjs [--reps 400] > eval/simulation.json
// m one-sided z-tests, m1 of them with mean shift `shift`, the rest N(0,1);
// optional equicorrelation rho between all test statistics (one shared factor).
// Reports, per method at alpha 0.05, the mean false discovery proportion
// (FDR), the share of runs with at least one false discovery (FWER) and the
// mean share of true effects found (power); and the spread of Storey's pi0.
import { analyze } from "../engine.mjs";

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
// Upper tail of N(0,1), P(Z > z) = erfc(z / sqrt 2) / 2: a power series for
// erf near 0 and Lentz's continued fraction for erfc above (checked against
// scipy.stats.norm.sf in engine.test.mjs, to 1e-12 relative).
export function normSf(z) {
  if (z < 0) return 1 - normSf(-z);
  const x = z / Math.SQRT2;
  if (x < 0.5) {
    let sum = x, term = x;
    for (let n = 1; n < 60; n++) { term *= (-x * x) / n; sum += term / (2 * n + 1); }
    return 0.5 * (1 - (2 / Math.sqrt(Math.PI)) * sum);
  }
  let f = x, C = x, D = 0;
  for (let n = 1; n < 300; n++) {
    const a = n / 2;
    D = x + a * D; D = 1 / D;
    C = x + a / C;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return (0.5 * Math.exp(-x * x)) / (f * Math.sqrt(Math.PI));
}

export function simulate({ m = 1000, m1 = 100, shift = 2.5, rho = 0, reps = 400, alpha = 0.05, seed = 20261111 } = {}) {
  const rand = mulberry32(seed);
  const acc = {};
  const pi0s = [], storeyFdp = [];
  for (let r = 0; r < reps; r++) {
    const shared = gauss(rand);
    const p = new Array(m);
    for (let i = 0; i < m; i++) {
      const z = Math.sqrt(rho) * shared + Math.sqrt(1 - rho) * gauss(rand) + (i < m1 ? shift : 0);
      p[i] = normSf(z);
    }
    const res = analyze({ values: p, labels: p.map((_, i) => String(i)), alpha });
    pi0s.push(res.pi0);
    for (const meth of res.methods) {
      let V = 0, S = 0;
      for (const it of res.items) if (it.rejected[meth.id]) (Number(it.label) < m1 ? S++ : V++);
      const a = (acc[meth.id] ??= { name: meth.name, fdp: 0, anyFalse: 0, power: 0, kept: 0 });
      a.fdp += V + S ? V / (V + S) : 0;
      a.anyFalse += V > 0 ? 1 : 0;
      a.power += S / m1;
      a.kept += V + S;
      if (meth.id === "storey") storeyFdp.push(V + S ? V / (V + S) : 0);
    }
  }
  const out = {};
  for (const [id, a] of Object.entries(acc)) out[id] = { name: a.name, fdr: a.fdp / reps, fwer: a.anyFalse / reps, power: a.power / reps, meanKept: a.kept / reps };
  // Storey's pi0 across runs (truth: 1 - m1 / m) and the q-values' false discovery proportion when it came out below 0.5.
  const sorted = [...pi0s].sort((x, y) => x - y), qt = (f) => sorted[Math.floor(f * (sorted.length - 1))];
  const low = storeyFdp.filter((_, i) => pi0s[i] < 0.5);
  const pi0 = { truth: 1 - m1 / m, q05: qt(0.05), q25: qt(0.25), median: qt(0.5), q75: qt(0.75), q95: qt(0.95), shareBelowHalf: low.length / reps, storeyFdrWhenBelowHalf: low.length ? low.reduce((x, y) => x + y, 0) / low.length : null };
  return { settings: { m, m1, shift, rho, reps, alpha, seed }, methods: out, pi0 };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const i = process.argv.indexOf("--reps");
  const reps = i > 0 ? Number(process.argv[i + 1]) : 400;
  const runs = [simulate({ reps }), simulate({ reps, rho: 0.5, seed: 20261112 }), simulate({ reps, m1: 400, seed: 20261113 })];
  process.stdout.write(JSON.stringify({ generator: "eval/simulate.mjs", runs }, null, 1) + "\n");
}
