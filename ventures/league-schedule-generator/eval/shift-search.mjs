// lowCarryOverRounds with and without the shift-venue candidates (2026-11-11, README "Home and away
// that moves with the starter"). node eval/shift-search.mjs <weight> <sizes...>; seed 1, effort 1.
// One JSON line per size: carry-over / breaks / score off and on, the start kept, seconds.
import { lowCarryOverRounds } from "../carryover.mjs";

const weight = Number(process.argv[2] || 10);
for (const n of process.argv.slice(3).map(Number)) {
  const t0 = Date.now();
  const off = lowCarryOverRounds(n, { breakWeight: weight, shift: false });
  const t1 = Date.now();
  const on = lowCarryOverRounds(n, { breakWeight: weight });
  const t2 = Date.now();
  const s = (r) => ({ coe: r.coe, breaks: r.breaks, score: r.coe + weight * r.breaks, start: r.start });
  console.log(JSON.stringify({ n, weight, off: s(off), on: s(on), gain: s(off).score - s(on).score, secondsOff: (t1 - t0) / 1000, secondsOn: (t2 - t1) / 1000 }));
}
