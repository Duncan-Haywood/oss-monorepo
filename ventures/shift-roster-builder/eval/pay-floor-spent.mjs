// The pay floor once the time budget is spent (README "The pay floor once the budget is spent", 2026-11-16). One generated week
// (the generator of eval/warm-gate-e2e.mjs and eval/pay-floor-reserve.mjs) built at the default 20 s budget in one of two ways:
// "full", `scoreFloorSpent: true` with a reserve no build reaches (60 s), so the pay floor runs even when the earlier stages spent
// the budget and reports its whole warm time; and "base", the default when the runs were made (skipped once the budget is spent;
// since the default changed, "nospent" is that build and "default" today's). The summary
// (eval/pay-floor-spent-summary.py) scores the spent try at any reserve R: on a spent week it finishes iff its time <= R.
//   SEED=<n> RUNS=full,base node eval/pay-floor-spent.mjs P S week
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
const SEED = Number(process.env.SEED || 20261022);
let seed = SEED + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
let st, sh;
for (let c = 0; c <= week; c++) {
  st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
}
const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
for (const run of (process.env.RUNS || "full,base").split(",")) {
  const opts = run === "base" || run === "default" ? {} : run === "nospent" ? { scoreFloorSpent: false } : run === "full" ? { scoreFloorSpent: true, scoreFloorReserveMs: 60000, scoreFloorSpentReserveMs: 60000 } : run === "spent" ? { scoreFloorSpent: true } : { scoreFloorSpent: true, scoreFloorReserveMs: Number(run) };
  const t0 = Date.now();
  const r = buildRoster(staff, slots, { exact: true, timeBudgetMs: 20000, ...opts });
  const o = r.optimality, t = o.scoreFloorTried;
  const open = Math.floor(r.score / 100000 + 1e-9);
  console.log(JSON.stringify({ seed: SEED, P, S, week, run, open, score: Number(r.score.toFixed(2)), gap: Number((o.gap ?? 0).toFixed(2)), status: o.status,
    proven: o.status !== "bounded", skip: o.scoreFloorSkip ?? null,
    tried: t ? { finished: t.finished, ms: t.ms, left: t.left, reserve: t.reserve, spent: !!t.spent } : null, payFloorMs: o.scoreFloor?.ms ?? null,
    dayLNS: !!o.dayLNS, ms: Date.now() - t0 }));
}
