// The weighted starters (STARTERS_WEIGHTED, eval/starter-breaks.mjs) through the search: the
// result lowCarryOverRounds / lowCarryOverDoubleRounds return with a break weight, without them
// (weightedStarter: false, the behaviour before) and with them (the default). Seed 1, effort 1;
// both runs keep the better of the circle and starter starts.
// node eval/starter-breaks-search.mjs [weight] [sizes...]   (default 10, every size with an entry)
import { lowCarryOverRounds, lowCarryOverDoubleRounds, STARTERS_WEIGHTED } from "../carryover.mjs";

const w = Number(process.argv[2] || 10);
const sizes = process.argv.length > 3 ? process.argv.slice(3).map(Number)
  : Object.entries(STARTERS_WEIGHTED).flatMap(([N, e]) => [e.even ? +N : null, e.odd ? +N - 1 : null]).filter((n) => n);
const fmt = (x) => x.toLocaleString("en");
const score = (r) => r.coe + w * r.breaks + 1000 * (r.repeats || 0); // the search's own (REPEAT_PENALTY)
console.log(`| Teams | Season | Before (carry-over / breaks, score) | With weighted starters | Score change |`);
console.log("|---|---|---|---|---|");
const tally = { lower: 0, higher: 0, same: 0 };
for (const n of sizes) for (const double of [false, true]) {
  const run = (weightedStarter) => double
    ? lowCarryOverDoubleRounds(n, { seed: 1, breakWeight: w, weightedStarter })
    : lowCarryOverRounds(n, { seed: 1, breakWeight: w, weightedStarter });
  const o = run(false), m = run(true);
  const d = score(m) - score(o);
  tally[d < 0 ? "lower" : d > 0 ? "higher" : "same"]++;
  console.log(`| ${n} | ${double ? "home and away" : "single"} | ${fmt(o.coe)} / ${o.breaks}, ${fmt(score(o))} (${o.start}) | ${fmt(m.coe)} / ${m.breaks}, ${fmt(score(m))} (${m.start}) | ${d === 0 ? "same" : (d > 0 ? "+" : "") + fmt(d)} |`);
}
console.log(`\nweight ${w}: lower ${tally.lower}, higher ${tally.higher}, same ${tally.same}`);
