// The stored 14-team timetable (TIMETABLES[14], eval/refill-search.c, 2026-11-14) through the page's
// searches: with and without it, seeds 1-3, effort 1, single round robin and home-and-away season,
// carry-over only and break weight 10. Carry-over / breaks.
// node eval/stored-14.mjs   (output eval/stored-14.txt)
import { lowCarryOverRounds, lowCarryOverDoubleRounds, TIMETABLES } from "../carryover.mjs";

const saved = TIMETABLES[14];
const fmt = (r) => `${r.coe.toLocaleString("en")} / ${r.breaks}`;
console.log("| Seed | Season | Setting | Without (carry-over / breaks) | With the stored 14 | Start kept |");
console.log("|---|---|---|---|---|---|");
for (const seed of [1, 2, 3]) for (const double of [false, true]) for (const w of [0, 10]) {
  const run = () => (double ? lowCarryOverDoubleRounds(14, { seed, breakWeight: w }) : lowCarryOverRounds(14, { seed, breakWeight: w }));
  delete TIMETABLES[14];
  const a = run();
  TIMETABLES[14] = saved;
  const b = run();
  console.log(`| ${seed} | ${double ? "home and away" : "single"} | ${w ? "break weight 10" : "carry-over only"} | ${fmt(a)} | ${fmt(b)} | ${b.start ?? "-"} |`);
}
