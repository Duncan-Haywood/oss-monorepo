// Coverage of the 95% MLS intervals by simulation: draw studies from the
// random-effects model with known variances, analyse each one, and count
// how often each interval contains the true variance.
// Run: node eval/coverage.mjs [reps]  (output kept in eval/coverage-output.txt)
import { analyze } from "../engine.mjs";

const reps = Number(process.argv[2] ?? 2000);
let seed = 20261118;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());

const configs = [
  { design: "crossed", p: 10, o: 3, n: 3, sP: 1, sO: 0.3, sPO: 0.2, sE: 0.4 },
  { design: "crossed", p: 10, o: 3, n: 2, sP: 1, sO: 0.5, sPO: 0, sE: 0.3 },
  { design: "crossed", p: 10, o: 2, n: 2, sP: 1, sO: 0.2, sPO: 0.2, sE: 0.2 },
  { design: "crossed", p: 5, o: 3, n: 2, sP: 0.5, sO: 0.4, sPO: 0.3, sE: 0.3 },
  { design: "crossed", p: 20, o: 4, n: 3, sP: 2, sO: 0, sPO: 0.1, sE: 0.5 },
  { design: "nested", p: 5, o: 3, n: 2, sP: 1, sO: 0.4, sPO: 0, sE: 0.3 },
  { design: "nested", p: 10, o: 3, n: 3, sP: 1, sO: 0.2, sPO: 0, sE: 0.5 },
];

console.log(`95% MLS interval coverage, ${reps} simulated studies per row (seed 20261118)`);
console.log("design   p  o  n   sd(P, O, PO, E)          GRR    repeat  reprod  part   operator");
for (const c of configs) {
  const truth = c.design === "crossed"
    ? { grr: c.sO ** 2 + c.sPO ** 2 + c.sE ** 2, repeatability: c.sE ** 2, reproducibility: c.sO ** 2 + c.sPO ** 2, part: c.sP ** 2, operator: c.sO ** 2 }
    : { grr: c.sO ** 2 + c.sE ** 2, repeatability: c.sE ** 2, reproducibility: c.sO ** 2, part: c.sP ** 2 };
  const hits = Object.fromEntries(Object.keys(truth).map((k) => [k, 0]));
  for (let r = 0; r < reps; r++) {
    const obs = [];
    const O = Array.from({ length: c.o }, () => c.sO * gauss());
    const P = Array.from({ length: c.p }, () => c.sP * gauss());
    for (let i = 0; i < c.o; i++) for (let j = 0; j < c.p; j++) {
      const pe = c.design === "crossed" ? P[j] + c.sPO * gauss() : c.sP * gauss();
      for (let k = 0; k < c.n; k++) obs.push({ part: c.design === "crossed" ? `P${j}` : `O${i}P${j}`, operator: `O${i}`, y: 10 + O[i] + pe + c.sE * gauss() });
    }
    const res = analyze({ obs, design: c.design, interaction: "keep" });
    for (const k of Object.keys(truth)) {
      const row = res.components.find((x) => x.key === k);
      const v = truth[k];
      if (row.sdLower ** 2 <= v * (1 + 1e-12) && v <= row.sdUpper ** 2 * (1 + 1e-12)) hits[k]++;
    }
  }
  const pct = (k) => (k in hits ? ((100 * hits[k]) / reps).toFixed(1).padStart(6) : "     -");
  console.log(`${c.design.padEnd(8)} ${String(c.p).padStart(2)} ${c.o}  ${c.n}   (${c.sP}, ${c.sO}, ${c.sPO}, ${c.sE})`.padEnd(41) + [pct("grr"), pct("repeatability"), pct("reproducibility"), pct("part"), pct("operator")].join("  "));
}
