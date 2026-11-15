// The flow-bounded repair against the depth-first one, on the repair alone (README "The repair's neighbourhood under a flow
// bound"): the same eight 80-100 person bench weeks and three fixed starts each as eval/repair-alone.mjs (a guided plateau walk
// of 400,000 steps from an empty roster), then coverRepair with bound "dfs" (main's search) and "flow" (now the default) at k = 3
// and 5 people, each under the same node budget and once more under the same wall-clock time.
//   node eval/repair-flow.mjs P S week startSeed      (one JSON line per repair; results eval/repair-flow.jsonl)
import * as cur from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const [P, S, week] = [2, 3, 4].map((i) => Number(process.argv[i]));
const startSeed = Number(process.argv[5] || 1);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < week) continue;
  const staff = cur.parseStaff(st).staff, slots = cur.parseShifts(sh).slots;
  const { buildContext, coverPass, coverRepair, cliqueOpenFloor, ownerValid } = cur._internals;
  const ctx = buildContext(staff, slots, { exact: true });
  const lp = cliqueOpenFloor(ctx, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), startSeed, 400000, { guide: lp.xs }).owner;
  const hrs = (o) => o.reduce((t, p, i) => t + (p < 0 ? (slots[i].end - slots[i].start) / 60 : 0), 0);
  const runs = [
    ["dfs k3", { k: 3, rounds: 60, bound: "dfs" }],
    ["flow k3", { k: 3, rounds: 60, bound: "flow" }],
    ["dfs k5", { k: 5, rounds: 60, bound: "dfs" }],
    ["flow k5", { k: 5, rounds: 60, bound: "flow" }],
    ["dfs k3 2s", { k: 3, rounds: 1e9, totalNodes: Infinity, timeLimitMs: 2000, bound: "dfs" }],
    ["flow k3 2s", { k: 3, rounds: 1e9, totalNodes: Infinity, timeLimitMs: 2000, bound: "flow" }],
    ["flow k5 2s", { k: 5, rounds: 1e9, totalNodes: Infinity, timeLimitMs: 2000, bound: "flow" }],
  ];
  for (const [name, opts] of runs) {
    const t0 = Date.now(), r = coverRepair(ctx, start, 7919, opts);
    console.log(JSON.stringify({ P, S, week, copies: slots.length, startSeed, floor: Math.round(lp.floor * 100) / 100, start: hrs(start), repair: name, open: hrs(r.owner), valid: ownerValid(ctx, r.owner), gains: r.gains, floors: r.floors, skipped: r.skipped, reached: r.reached, ms: Date.now() - t0 }));
  }
}
