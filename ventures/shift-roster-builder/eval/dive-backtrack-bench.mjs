// node eval/dive-backtrack-bench.mjs P S cases [budgets=10,30,100]   (SEED=n picks the seed; weeks as cg-scale-bench.mjs)
// Weeks where the dives without retries miss the root bound: does backtracking (budget B) reach the optimum, and how long does
// the whole proof (dives + tree) take with and without it?
import { parseStaff, parseShifts, openFloorByColumnGeneration } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2]), S = Number(process.argv[3]), cases = Number(process.argv[4]);
const budgets = (process.argv[5] || "10,30,100").split(",").map(Number);
let seed = Number(process.env.SEED || 7) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const hit = Object.fromEntries(budgets.map((b) => [b, 0]));
let miss = 0; const tFull = { 0: 0 }; for (const b of budgets) tFull[b] = 0;
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const a = openFloorByColumnGeneration(staff, slots, { exact: true }, { nodeLimit: 1, ms: 60000, diveBacktrack: 0 });
  if (a.best != null && a.proven) continue;
  miss++;
  const row = [c, "rootLP", a.rootLP.toFixed(2), "no-retry", a.best];
  const f0 = openFloorByColumnGeneration(staff, slots, { exact: true }, { nodeLimit: 100000, ms: 120000, diveBacktrack: 0 });
  const opt = f0.proven ? f0.best : null; tFull[0] += f0.stats.ms;
  row.push("optimum", opt, "full", f0.stats.ms + "ms");
  for (const b of budgets) {
    const d = openFloorByColumnGeneration(staff, slots, { exact: true }, { nodeLimit: 1, ms: 60000, diveBacktrack: b });
    const f = openFloorByColumnGeneration(staff, slots, { exact: true }, { nodeLimit: 100000, ms: 120000, diveBacktrack: b });
    tFull[b] += f.stats.ms;
    if (opt != null && d.best === opt) hit[b]++;
    row.push(`| B=${b}`, d.best, `${d.stats.diveRetries ?? 0}r`, `full ${f.stats.ms}ms ${f.proven ? "proven" : "OPEN"}`);
  }
  console.log(row.join(" "));
}
console.log(`P=${P} S=${S} seed ${process.env.SEED || 7}: ${miss} of ${cases} weeks missed by the dives without retries`);
for (const b of budgets) console.log(`  budget ${b}: dive alone reaches the optimum on ${hit[b]} of ${miss}; full proof total ${tFull[b]} ms (no retries ${tFull[0]} ms)`);
