// How often does each test find a trend in trend-free AR(1) noise at alpha = 0.05?
// Seeded and repeatable:  node eval/size-simulation.mjs > eval/size-simulation.json
import { analyze, yueWangFactor, senSlope, varS, mkScore, zScore, normSf } from "../engine.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const REPS = 1000;
const rows = [];
for (const phi of [0, 0.3, 0.6, 0.8]) {
  for (const n of [50, 100, 200]) {
    const r = rng(1000 * phi + n);
    const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());
    const count = { none: 0, "yue-wang": 0, "hamed-rao": 0, "hamed-rao-3": 0, tfpw: 0, "yue-wang-all-lags": 0 };
    for (let k = 0; k < REPS; k++) {
      const x = [];
      let e = gauss() / Math.sqrt(1 - phi * phi); // start in the stationary distribution
      for (let i = 0; i < n; i++) {
        x.push(e);
        e = phi * e + gauss();
      }
      const a = analyze({ x });
      for (const key of ["none", "yue-wang", "hamed-rao", "hamed-rao-3", "tfpw"]) if (a.tests[key].p < 0.05) count[key]++;
      const t = a.times;
      const resid = a.values.map((v, i) => v - a.sen.slope * t[i]);
      const f = yueWangFactor(resid, "all");
      const v = a.varianceNoCorrection * f;
      if (!(v > 0) || 2 * normSf(Math.abs(zScore(a.s, v))) < 0.05) count["yue-wang-all-lags"]++;
    }
    const rate = Object.fromEntries(Object.entries(count).map(([k, c]) => [k, c / REPS]));
    rows.push({ phi, n, reps: REPS, rejectionRate: rate });
  }
}
console.log(JSON.stringify({ alpha: 0.05, note: "Share of trend-free AR(1) series of length n with lag-1 coefficient phi that each test calls a trend. A test that holds its size scores about 0.05.", rows }, null, 1));
