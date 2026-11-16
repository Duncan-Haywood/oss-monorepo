// Where the time past the budget goes (README "Where the time past the budget goes", 2026-11-16). One generated week (the
// generator of eval/pay-floor-spent.mjs) built at the default 20 s budget with today's defaults; prints the stage timeline
// (`timeline`, each stage's end in ms since the start), the stage that crossed the budget and how far past it each ended.
//   SEED=<n> node eval/stage-overrun.mjs P S week [json options]
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 70), S = Number(process.argv[3] || 196), week = Number(process.argv[4] || 0);
const extra = process.argv[5] ? JSON.parse(process.argv[5]) : {};
const SEED = Number(process.env.SEED || 20261022);
let seed = SEED + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
let st, sh;
for (let c = 0; c <= week; c++) {
  st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
}
const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
const BUDGET = 20000;
const t0 = Date.now();
const r = buildRoster(staff, slots, { exact: true, timeBudgetMs: BUDGET, memo: false, ...extra });
const o = r.optimality || {};
const tl = r.timeline || [];
// The stage that ran the clock past the budget: the first whose end is past it while the one before ended inside it.
let crossed = null, prevEnd = 0;
for (const [name, at] of tl) {
  if (at > BUDGET) { crossed = { stage: name, startedAt: prevEnd, endedAt: at, over: at - BUDGET }; break; }
  prevEnd = at;
}
const preFloor = tl.filter(([n]) => !["scoreFloor", "dayLNS", "summary", "critical", "hireTest"].includes(n));
const atPayFloor = preFloor.length ? preFloor[preFloor.length - 1][1] : null;
console.log(JSON.stringify({ seed: SEED, P, S, week, extra, open: Math.floor(r.score / 100000 + 1e-9), score: Number(r.score.toFixed(2)), gap: Number((o.gap ?? 0).toFixed(2)), status: o.status,
  skip: o.scoreFloorSkip ?? null, atPayFloor, spentBy: atPayFloor !== null ? atPayFloor - BUDGET : null, crossed, timeline: tl,
  coverRepair: o.coverRepair ?? null, cg: o.scoreCG ? { ms: o.scoreCG.ms, shareMs: o.scoreCG.shareMs, maxLpMs: o.scoreCG.maxLpMs, maxPricingMs: o.scoreCG.maxPricingMs, stoppedMidRound: o.scoreCG.stoppedMidRound } : null,
  clique: o.cliqueFloor ? { ms: o.cliqueFloor.ms } : null, ms: Date.now() - t0 }));
