// Remembered pair searches (2026-11-15, README "Remembered pair searches").
//
// The pair-priced pass spends most of its time in pair walks, and on the big weeks most of that in pairs the 500-check budget
// gives up on: every candidate move re-walks them. `coverPairRisk`'s memo reuses a pair's verdict when every list its search
// read is unchanged, which is exact. For each seeded week the plain roster is built once (seed 1), then the pass runs from it
// uncapped with the memo off and on, and the two runs must take the same moves to the same roster.
//   node eval/pair-memo.mjs     WEEKS=20x56:2,40x112:0,40x112:1  PRICE=25  PAIR=1  MODES=off,memo
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass, coverPairRisk, pairMemo } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1);
const want = (process.env.WEEKS ?? "20x56:2,40x112:0,40x112:1").split(",");
const modes = (process.env.MODES ?? "off,memo").split(",");
for (const w of want) {
  const [size, wk] = w.split(":");
  const [P, S] = size.split("x").map(Number);
  const { staff: st, shifts: sh } = seededWeeks(P, S, Number(wk) + 1)[Number(wk)];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  const start = buildRoster(staff, slots, { ...BASE, seed: 1 }).owner;
  // Why it rarely hits: how many people's lists a remembered (given-up or failed) search read, on the starting roster.
  const memo = pairMemo();
  coverPairRisk(ctx, start, { memo });
  const sizes = { null: [], false: [] };
  for (const store of memo.byKey.values()) for (const e of store.values()) sizes[String(e.how)].push(e.who.length);
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-");
  console.log(`WEEK ${size} week ${wk}: ${P} people; a given-up pair's search read ${avg(sizes.null)} people's lists on average (${sizes.null.length} pairs), a failed one ${avg(sizes.false)} (${sizes.false.length} pairs)`);
  const runs = {};
  for (const m of modes) {
    const curve = [];
    const t0 = performance.now();
    const out = coverSlackPass(ctx, start, { price, pairPrice: pair, pairMemo: m === "memo", onMove: (x) => curve.push(performance.now() - t0) });
    runs[m] = { out, t: performance.now() - t0, curve };
  }
  console.log(`WEEK ${size} week ${wk} (${slots.length} copies)`);
  for (const m of modes) {
    const { out, t, curve } = runs[m];
    console.log(`  ${m}: ${out.moves} moves in ${(t / 1000).toFixed(2)} s, score ${out.score.toFixed(2)}, risk ${out.risk.hours} h, pair hours ${out.pairHours}, walks ${out.pairWalks} (${out.pairStops} cut off), pairs searched ${out.pairsSearched}, memo hits ${out.pairMemoHits} of ${out.pairMemoHits + out.pairMemoMisses}, candidates ${out.tried}`);
    console.log(`    moves at ${curve.map((c) => (c / 1000).toFixed(2)).join(", ") || "none"} s`);
  }
  const J = (o) => o.score + price * o.risk.hours + pair * o.pairHours;
  for (const m of modes) if (m !== "off" && runs.off) {
    const a = runs.off.out, b = runs[m].out;
    const same = a.owner.every((p, i) => p === b.owner[i]) && a.moves === b.moves && a.pairsSearched === b.pairsSearched;
    console.log(`  ${m} vs off: same roster, moves and pairs searched: ${same ? "yes" : "no"}; objective ${J(b).toFixed(2)} vs ${J(a).toFixed(2)}; time ${(runs[m].t / runs.off.t * 100).toFixed(0)}% of off`);
  }
}
