// On 350-400 copy weeks, is the open-hours clique LP worth the seconds it takes from the cover passes? Builds the end-to-end
// generator's weeks (eval/end-to-end.mjs, same seed rule as eval/cg-overrun.mjs) at the default 20 s budget, once per
// (configuration, search seed), and prints one JSON line per build: open hours, proof gap, which LPs ran, and stage times.
//   node eval/clique-vs-cover.mjs P S week config seed      config: default | noclique | unguided | guide90 | JSON options
// Results: eval/clique-vs-cover.out.txt (summary of the three .jsonl runs), README "The clique LP steers the cover passes".
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const [P, S, week] = [2, 3, 4].map((i) => Number(process.argv[i]));
const cfg = process.argv[5] || "default", runSeed = Number(process.argv[6] || 1);
const configs = { default: {}, noclique: { cliqueFloor: false }, unguided: { coverGuide: false }, guide90: { coverGuideProb: 0.9 } };
const extra = configs[cfg] ?? JSON.parse(cfg);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < week) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const t0 = Date.now();
  const r = buildRoster(staff, slots, { exact: true, timeBudgetMs: 20000, seed: runSeed, ...extra });
  const o = r.optimality || {};
  console.log(JSON.stringify({ P, S, week, copies: slots.length, cfg, seed: runSeed, open: r.unfilledHours, coverOpen: o.coverOpen ?? null,
    gap: o.gap ?? null, clique: !!o.cliqueFloor, guideFrom: o.dayLNS?.guideFrom ?? null, ms: Date.now() - t0, timings: r.timings }));
}
