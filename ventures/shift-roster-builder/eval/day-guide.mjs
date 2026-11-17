// LP-guided descent in buildRoster's dayLNS (calc.mjs, `dayGuide`, `dayGuideWeights`): before the kicks, every day is swept with
// each person-shift's cost lowered by lam x the average wage x its value in the pay floor's LP solution, then swept exactly; kept
// only when the true score drops. Same weeks as eval/day-lns.mjs (the cg-scale-bench generator of eval/end-to-end.mjs).
// Output of the runs in the README: eval/day-guide.out.txt.
//   node eval/day-guide.mjs [P=60] [S=168] [week=0] [configs as a JSON list]
// OPTS='{"...":...}' replaces the base buildRoster options (default {"timeBudgetMs":20000}).
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
const configs = process.argv[5] ? JSON.parse(process.argv[5]) : [
  { dayGuide: false }, { dayGuideWeights: [4, 2, 1, 0.5, 0.25] }, {},
];
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const base = process.env.OPTS ? JSON.parse(process.env.OPTS) : { timeBudgetMs: 20000 };
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < week) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  for (const cfg of configs) {
    const t0 = Date.now();
    const r = buildRoster(staff, slots, { exact: true, ...base, ...cfg });
    const o = r.optimality, d = o.dayLNS;
    console.log(`${P} x ${S} week ${c} ${JSON.stringify(cfg)}: score ${r.score.toFixed(2)}, bound ${o.lowerBound.toFixed(2)}, gap $${o.gap.toFixed(2)}, ${o.status}` +
      `${d ? `; pass ${d.before.toFixed(2)} -> ${d.after.toFixed(2)}, ${d.kicks} kicks, ${d.ms} ms; guide ${JSON.stringify((d.guide || []).map(([l, q]) => [l, +(q - o.lowerBound).toFixed(2)]))}` : ""}; ${Date.now() - t0} ms`);
  }
}
