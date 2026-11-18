// Exact size and power of the 2x2 tests at the 5% level, two-sided, equal arms.
// No simulation: for each design every possible table is tested, and the rejection
// probability is summed exactly under two independent binomials.
//   node eval/size.mjs > eval/size.json
import { fisherExact, barnardExact, boschlooExact, chiSquare, lfact } from "../engine.mjs";

const ALPHA = 0.05;
const ARMS = (process.argv[2] || "10,15,20,25,30,40,50").split(",").map(Number);
const POWER_AT = [[0.2, 0.5], [0.1, 0.4], [0.3, 0.7]];
const TESTS = {
  "Pearson chi-square": (t) => chiSquare(t).p,
  "Yates chi-square": (t) => chiSquare(t, { correct: true }).p,
  "Fisher exact": (t) => fisherExact(t).p,
  "Fisher mid-p": (t) => fisherExact(t).midP,
  "Boschloo": (t, x1, n1, x2, n2) => boschlooExact(x1, n1, x2, n2).p,
  "Barnard (pooled Wald)": (t, x1, n1, x2, n2) => barnardExact(x1, n1, x2, n2).p,
};

const lbin = (n, k, p) => lfact(n) - lfact(k) - lfact(n - k) + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log1p(-p) : 0);

function rejectProb(R, n1, n2, p1, p2) {
  let s = 0;
  for (const [x1, x2] of R) s += Math.exp(lbin(n1, x1, p1) + lbin(n2, x2, p2));
  return s;
}

const out = { alpha: ALPHA, sided: "two-sided", grid: "pi = 0.001 .. 0.999 step 0.001", designs: [] };
for (const n of ARMS) {
  const design = { n1: n, n2: n, tests: {} };
  for (const [name, fn] of Object.entries(TESTS)) {
    const R = [];
    for (let x1 = 0; x1 <= n; x1++) for (let x2 = 0; x2 <= n; x2++) {
      const t = [[x1, n - x1], [x2, n - x2]];
      const colsOk = x1 + x2 > 0 && x1 + x2 < 2 * n;
      const p = colsOk ? fn(t, x1, n, x2, n) : 1;
      if (p <= ALPHA) R.push([x1, x2]);
    }
    let max = 0, maxPi = 0, sum = 0, cnt = 0, over = 0;
    for (let i = 1; i < 1000; i++) {
      const pi = i / 1000;
      const s = rejectProb(R, n, n, pi, pi);
      if (s > max) { max = s; maxPi = pi; }
      if (s > ALPHA + 1e-12) over++;
      sum += s; cnt++;
    }
    design.tests[name] = {
      rejectingTables: R.length,
      maxSize: Number(max.toFixed(5)), atPi: maxPi, meanSize: Number((sum / cnt).toFixed(5)), shareOfPiOverAlpha: Number((over / cnt).toFixed(3)),
      power: Object.fromEntries(POWER_AT.map(([a, b]) => [`${a} vs ${b}`, Number(rejectProb(R, n, n, a, b).toFixed(4))])),
    };
  }
  out.designs.push(design);
  process.stderr.write(`n = ${n} done\n`);
}
console.log(JSON.stringify(out, null, 1));
