// The day sweeps' LP guide when the pay floor is skipped (calc.mjs `dayGuideOpen`, 2026-11-14): under the default 20 s budget the
// priced clique LP (cliqueScoreFloor) does not fit on most 60 x 168 weeks, so dayLNS had no guide. The open-hours clique LP, when it
// ran, now lends its person-shift values instead. Same weeks as eval/day-guide.mjs (the cg-scale-bench generator).
// Output of the runs in the README: eval/guide-open.out.txt.
//   SEED=<n> node eval/guide-open.mjs [P=60] [S=168] [week=0] [configs as a JSON list]
// OPTS='{"...":...}' replaces the base buildRoster options (default {"timeBudgetMs":20000}).
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
const configs = process.argv[5] ? JSON.parse(process.argv[5]) : [{ dayGuideOpen: false }, {}];
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
    const open = Math.floor(r.score / 100000 + 1e-9), rest = r.score - open * 100000;
    console.log(`seed ${process.env.SEED || 20261022}: ${P} x ${S} week ${c} ${JSON.stringify(cfg)}: open ${open} h (floor ${o.cliqueFloor ? o.cliqueFloor.floor.toFixed(1) : "-"}), rest $${rest.toFixed(2)}, gap $${(o.gap ?? 0).toFixed(2)}, ${o.status}` +
      `; LPs: clique ${o.cliqueFloor ? o.cliqueFloor.ms + " ms" : "skipped"}, priced ${o.scoreFloor ? o.scoreFloor.ms + " ms" + (o.scoreFloor.tried ? ` (tried past the gate with ${o.scoreFloorTried.left} ms left)` : "") : o.scoreFloorTried ? `tried with ${o.scoreFloorTried.left} ms left, out of time` : "skipped"}` +
      `${d ? `; pass open ${Math.floor(d.before / 100000 + 1e-9)} -> ${Math.floor(d.after / 100000 + 1e-9)}, guide from ${d.guideFrom || "none"} ${JSON.stringify((d.guide || []).map(([l, q]) => [l, Math.floor(q / 100000 + 1e-9)]))}, ${d.kicks} kicks` : ""}; ${Date.now() - t0} ms`);
  }
}
