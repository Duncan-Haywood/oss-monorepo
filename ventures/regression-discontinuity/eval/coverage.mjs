// Monte Carlo coverage of the conventional and robust 95% intervals at the
// automatic bandwidth, on the Lee (2008) calibration of Calonico, Cattaneo &
// Titiunik (2014), Model 1 (true jump 0.04), n = 1000 per draw.
//   node eval/coverage.mjs [replicates=1000] [seed=7]
// Seeded, so the numbers in the README reproduce exactly.
import { rdEstimate, selectBandwidth } from "../engine.mjs";

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lee = (x) => (x >= 0 ? 0.52 + 0.84 * x - 3.0 * x ** 2 + 7.99 * x ** 3 - 9.01 * x ** 4 + 3.56 * x ** 5 : 0.48 + 1.27 * x + 7.18 * x ** 2 + 20.21 * x ** 3 + 21.54 * x ** 4 + 7.33 * x ** 5);

export function coverage(reps = 1000, seed = 7, n = 1000) {
  const rnd = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  // Beta(2,4) is the 2nd smallest of 5 uniforms
  const beta24 = () => Array.from({ length: 5 }, rnd).sort((a, b) => a - b)[1];
  const truth = 0.04;
  let covC = 0, covR = 0, lenC = 0, lenR = 0, bias = 0, hs = 0, ok = 0;
  for (let r = 0; r < reps; r++) {
    const x = Array.from({ length: n }, () => 2 * beta24() - 1);
    const y = x.map((v) => lee(v) + 0.1295 * normal());
    try {
      const bw = selectBandwidth({ x, y });
      const e = rdEstimate({ x, y, h: bw.h, b: bw.b });
      ok++;
      hs += bw.h;
      bias += e.conventional.estimate - truth;
      if (e.conventional.ci[0] <= truth && truth <= e.conventional.ci[1]) covC++;
      if (e.robust.ci[0] <= truth && truth <= e.robust.ci[1]) covR++;
      lenC += e.conventional.ci[1] - e.conventional.ci[0];
      lenR += e.robust.ci[1] - e.robust.ci[0];
    } catch { /* counted as a failed draw */ }
  }
  return { reps, completed: ok, meanH: hs / ok, bias: bias / ok, conventionalCoverage: covC / ok, robustCoverage: covR / ok, conventionalLength: lenC / ok, robustLength: lenR / ok };
}

if (process.argv[1] && process.argv[1].endsWith("coverage.mjs")) {
  console.log(JSON.stringify(coverage(Number(process.argv[2]) || 1000, Number(process.argv[3]) || 7), null, 1));
}
