// The pay floor's reserve size (README "The pay floor's reserve, sized from the full solve", 2026-11-16). One generated week (the
// weeks of eval/warm-gate-e2e.mjs) built twice at the default 20 s budget: "full", the pay floor given a reserve no build reaches
// (60 s), so it always finishes and reports its whole warm time; and "off", `scoreFloor: false`, which is exactly the path of a
// try that runs out of time (priced stays null). From the two, eval/pay-floor-reserve-summary.py scores any reserve R: the try
// finishes iff its time <= max(0, left) + R.
//   SEED=<n> node eval/pay-floor-reserve.mjs P S week
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
for (const run of (process.env.RUNS || "full,off").split(",")) {
  const opts = run === "full" ? { scoreFloorReserveMs: 60000 } : run === "off" ? { scoreFloor: false } : { scoreFloorReserveMs: Number(run) };
  const t0 = Date.now();
  const r = buildRoster(staff, slots, { exact: true, timeBudgetMs: 20000, ...opts });
  const o = r.optimality, t = o.scoreFloorTried;
  const open = Math.floor(r.score / 100000 + 1e-9);
  console.log(JSON.stringify({ seed: SEED, P, S, week, run, open, score: Number(r.score.toFixed(2)), gap: Number((o.gap ?? 0).toFixed(2)), status: o.status,
    proven: o.status !== "bounded", clique: o.cliqueFloor ? true : false, carry: !!t || !!o.scoreFloor,
    tried: t ? { finished: t.finished, ms: t.ms, left: t.left, reserve: t.reserve } : null, payFloorMs: o.scoreFloor?.ms ?? null,
    dayLNS: !!o.dayLNS, ms: Date.now() - t0 }));
}
