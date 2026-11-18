// Does the clique LP's guide help coverRepair choose its people, and should the plateau walks leave the repair some time?
// Builds the end-to-end generator's weeks (same generator and seed rule as eval/clique-vs-cover.mjs) at the default 20 s budget,
// once per (configuration, search seed), and prints one JSON line per build.
//   node eval/repair-guide.mjs P S week config seed
//   config: default (the guide on, as it was while measured) | dfs | flow | dfs<ms> | flow<ms> (repair search, and reserve) | unguided (repairGuide: false) | guided (repairGuide: true) | reserve<ms> | reserve<ms>u (unguided) | JSON options
// Results: eval/repair-guide.jsonl, eval/repair-guide.out.txt, README "The clique LP picks the repair's people".
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { parseStaff, parseShifts, buildRoster } = await import(process.env.ENGINE === "main" ? pathToFileURL(resolve(process.env.MAIN_ENGINE)).href : "../calc.mjs"); // ENGINE=main with MAIN_ENGINE=<path to> git show b92b1c892:ventures/shift-roster-builder/calc.mjs, for the baseline
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const [P, S, week] = [2, 3, 4].map((i) => Number(process.argv[i]));
const cfg = process.argv[5] || "default", runSeed = Number(process.argv[6] || 1);
const m = /^reserve(\d+)(u?)$/.exec(cfg);
const extra = cfg === "default" ? { repairGuide: true } : cfg === "unguided" ? { repairGuide: false } : cfg === "guided" ? { repairGuide: true }
  : m ? { coverRepairReserveMs: Number(m[1]), repairGuide: !m[2] }
  : /^(dfs|flow)(\d*)$/.test(cfg) ? { coverRepairBound: cfg.match(/^[a-z]+/)[0], ...(cfg.match(/\d+$/) ? { coverRepairReserveMs: Number(cfg.match(/\d+$/)[0]) } : {}) } // README "The repair's neighbourhood under a flow bound": dfs | flow | dfs2000 | flow2000
  : JSON.parse(cfg);
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
  console.log(JSON.stringify({ P, S, week, copies: slots.length, cfg: process.env.ENGINE === "main" ? "main" : cfg, seed: runSeed, open: r.unfilledHours, coverOpen: o.coverOpen ?? null,
    floor: o.forcedOpenHours ?? null, repair: o.coverRepair ?? null, ms: Date.now() - t0, timings: r.timings }));
}
