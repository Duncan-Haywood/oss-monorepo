// The field start (fieldOpp, 2026-11-11) against the old circle-method start, seed 1, effort 1.
// node eval/field-start.mjs [sizes...]   (default 7 8 15 16 31 32; output eval/field-start.txt)
import { lowCarryOverRounds, lowCarryOverDoubleRounds } from "../carryover.mjs";

const sizes = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [7, 8, 15, 16, 31, 32];
const fmt = (x) => x.toLocaleString("en");
console.log("| Teams | Season | Setting | Circle start (carry-over / breaks) | Field start | Floor |");
console.log("|---|---|---|---|---|---|");
for (const n of sizes) for (const double of [false, true]) for (const w of [0, 10]) {
  const run = (field) => double
    ? lowCarryOverDoubleRounds(n, { seed: 1, breakWeight: w, field })
    : lowCarryOverRounds(n, { seed: 1, breakWeight: w, field });
  const o = run(false), m = run(true);
  console.log(`| ${n} | ${double ? "home and away" : "single"} | ${w ? "break weight 10" : "carry-over only"} | ${fmt(o.coe)} / ${o.breaks} | ${fmt(m.coe)} / ${m.breaks} | ${fmt(m.lowerBound)} |`);
}
