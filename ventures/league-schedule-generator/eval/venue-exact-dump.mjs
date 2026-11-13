// Dumps the 16 seasons the page lists for a size and seed (12 tries, then 4 squeezes) as JSON, for
// eval/venue-exact.py to find each timetable's least breaks exactly. One file per (size, seed, kind).
//
//   node eval/venue-exact-dump.mjs --sizes 10,12,...,20 --seeds 1,2,3 [--double] --out dir
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { carryOverTry, carryOverSqueezes, CARRY_OVER_GAP, CARRY_OVER_SQUEEZE } from "../carryover.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const sizes = arg("--sizes", "12").split(",").map(Number);
const seeds = arg("--seeds", "1").split(",").map(Number);
const double = process.argv.includes("--double");
const out = arg("--out", "venue-exact-cache");
mkdirSync(out, { recursive: true });
for (const n of sizes) for (const seed of seeds) {
  const file = `${out}/${double ? "double" : "single"}-${n}-${seed}.json`;
  if (existsSync(file)) continue;
  const t0 = Date.now();
  const tries = [];
  for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) tries.push(carryOverTry(n, i, { double, seed, weighted: 8 }));
  const all = carryOverSqueezes(n, tries, CARRY_OVER_SQUEEZE, { seed });
  writeFileSync(file, JSON.stringify({ n, seed, double, seasons: all.map((t) => ({ index: t.index, coe: t.coe, breaks: t.breaks, rounds: t.rounds })) }));
  console.log(file, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
