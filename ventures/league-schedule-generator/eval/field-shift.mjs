// Shift candidates at the field sizes (2026-11-12, README "Shift venues carried through the search").
// When the league, a bye team included, is a power of two, lowCarryOverRounds starts from the field
// timetable; with a break weight it now also scores the STARTERS_SHIFT entries for 16 and 32 (odd).
// node eval/field-shift.mjs <sizes...>; weight 10, effort 1, seeds 1 and 2; shift: false is before.
import { lowCarryOverRounds } from "../carryover.mjs";

for (const n of process.argv.slice(2).map(Number)) for (const seed of [1, 2]) {
  const t0 = Date.now();
  const off = lowCarryOverRounds(n, { breakWeight: 10, seed, shift: false });
  const t1 = Date.now();
  const on = lowCarryOverRounds(n, { breakWeight: 10, seed });
  const t2 = Date.now();
  const s = (r) => ({ coe: r.coe, breaks: r.breaks, score: r.coe + 10 * r.breaks, start: r.start ?? "field" });
  console.log(JSON.stringify({ n, seed, before: s(off), now: s(on), secondsBefore: (t1 - t0) / 1000, secondsNow: (t2 - t1) / 1000 }));
}
