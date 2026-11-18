// The warm-sized gate end to end (calc.mjs scoreFloorPlan, 2026-11-16): the same generated weeks as eval/guide-open.mjs built at
// the default 20 s budget by the engine before the change (CALC_OLD, a copy of main's calc.mjs next to bnp.mjs) and after it.
//   CALC_OLD=/path/to/old/calc.mjs SEED=<n> node eval/warm-gate-e2e.mjs [P=60] [S=168] [week=0]
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
const engines = [["before", process.env.CALC_OLD], ["after", new URL("../calc.mjs", import.meta.url).href]];
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
let st, sh;
for (let c = 0; c <= week; c++) {
  st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
}
for (const [name, path] of engines) {
  if (!path) continue;
  const m = await import(path);
  const staff = m.parseStaff(st).staff, slots = m.parseShifts(sh).slots;
  const t0 = Date.now();
  const r = m.buildRoster(staff, slots, { exact: true, timeBudgetMs: 20000 });
  const o = r.optimality, t = o.scoreFloorTried, d = o.dayLNS;
  const open = Math.floor(r.score / 100000 + 1e-9), rest = r.score - open * 100000;
  const pf = o.scoreFloor ? `${o.scoreFloor.ms} ms${o.scoreFloor.tried ? ` (tried, ${t?.left ?? "?"} ms left)` : ""}` : t ? `tried, ${t.left ?? "?"} ms left, out of time after ${t.ms} ms` : "skipped";
  console.log(JSON.stringify({ seed: Number(process.env.SEED || 20261022), P, S, week, engine: name, open, rest: Number(rest.toFixed(2)), gap: Number((o.gap ?? 0).toFixed(2)),
    status: o.status, clique: o.cliqueFloor?.ms ?? null, payFloor: pf, payFloorRan: !!o.scoreFloor, guide: d?.guideFrom ?? null, ms: Date.now() - t0 }));
}
