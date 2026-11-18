// Shift candidates past their own venues (2026-11-12, README "Shift venues carried through the
// search"). node eval/shift-carry.mjs <weight> <seed> <sizes...>; effort 1. One JSON line per size,
// carry-over / breaks / score (carry-over + weight x breaks) under four settings of lowCarryOverRounds:
//   before   shiftCapped: false (the search as of 2026-11-11)
//   capped   the default: each shift candidate also annealed on carry-over with its home/away
//            carried and its breaks as the cap (lowCarryOverCappedRounds({ start }))
//   seeded   shiftCapped: false, carryHosts: "seed": the starter's shift hosts carried through the
//            search's moves as one more venue-search start
//   carry    shiftCapped: false, carryHosts: true: as seed, and the carried hosts' breaks also price
//            moves in the break-weighted pass
import { lowCarryOverRounds } from "../carryover.mjs";

const weight = Number(process.argv[2] || 10), seed = Number(process.argv[3] || 1);
const modes = {
  before: { shiftCapped: false },
  capped: {},
  seeded: { shiftCapped: false, carryHosts: "seed" },
  carry: { shiftCapped: false, carryHosts: true },
};
for (const n of process.argv.slice(4).map(Number)) {
  const line = { n, weight, seed };
  for (const [k, o] of Object.entries(modes)) {
    const t0 = Date.now();
    const r = lowCarryOverRounds(n, { breakWeight: weight, seed, ...o });
    line[k] = { coe: r.coe, breaks: r.breaks, score: r.coe + weight * r.breaks, start: r.start, seconds: (Date.now() - t0) / 1000 };
  }
  console.log(JSON.stringify(line));
}
