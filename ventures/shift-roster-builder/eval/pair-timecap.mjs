// A time cap on the second-call-out price's pass (2026-11-15, README "A time cap on the pair price").
//
// README "The pair price in played weeks" left the pair price capped at 120 shift copies because one 121-copy week's pass took
// 241 s, and named the fix: stop the pass at a time budget and keep the moves made. Every move the pass takes lowers
// score + $PRICE x risk hours + $PAIR x pair hours on its own (each is confirmed by the full walks), so a pass stopped between
// moves is a prefix of the uncapped one. The question is how much of the uncapped pass's gain a prefix of a few seconds keeps.
//
// For each seeded week the plain roster is built once (seed 1). The uncapped pass runs from it with an onMove hook that
// records, at each move taken, the time since the pass began and the objective. That gives the "anytime" curve: what a cap of
// T seconds would keep is the state at the last move taken before T. Then the pass is run again with each cap in CAPS (ms),
// and the script checks its roster is the uncapped pass's roster after some number of moves (a prefix), and reports the share
// of the uncapped gain it kept and its wall time. Gains are in the pass's own objective (dollars of score plus priced hours).
// Invented teams and seeded weeks, single runs on one machine; times depend on the machine.
//   CAPS_ONLY=1 runs only the capped passes (eval/pair-timecap-caps.out.txt), on the clock that counts the starting walks.
//   node eval/pair-timecap.mjs     WEEKS=20x56:2,30x84:0,40x112:0,60x168:0  CAPS=2000,5000,10000  PRICE=25  PAIR=1
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1);
const CAPS_ONLY = process.env.CAPS_ONLY === "1";
const caps = (process.env.CAPS ?? "2000,5000,10000").split(",").map(Number);
const want = (process.env.WEEKS ?? "20x56:2,30x84:0,40x112:0,60x168:0").split(",");
const J = (score, risk, ph) => score + price * risk + pair * ph;
for (const w of want) {
  const [size, wk] = w.split(":");
  const [P, S] = size.split("x").map(Number);
  const { staff: st, shifts: sh } = seededWeeks(P, S, Number(wk) + 1)[Number(wk)];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  const start = buildRoster(staff, slots, { ...BASE, seed: 1 }).owner;
  const curve = [];
  let t0 = performance.now();
  if (CAPS_ONLY) {
    // The caps alone, against the uncapped objective recorded in eval/pair-timecap.out.txt (gains in dollars here).
    const z = coverSlackPass(ctx, start, { price, pairPrice: pair, rounds: 0 });
    const J0 = J(z.score, z.risk.hours, z.pairHours);
    console.log(`WEEK ${size} week ${wk} (${slots.length} copies), caps only, starting objective ${J0.toFixed(2)}`);
    for (const cap of caps) {
      t0 = performance.now();
      const c = coverSlackPass(ctx, start, { price, pairPrice: pair, pairMs: cap });
      const tc = performance.now() - t0;
      const g = c.pairHours == null ? 0 : J0 - J(c.score, c.risk.hours, c.pairHours);
      console.log(`  cap ${(cap / 1000).toFixed(1)} s: ${(tc / 1000).toFixed(1)} s wall, ${c.moves} moves, timed out ${c.pairTimedOut}, starting count timed out ${c.pairStartTimedOut}, gain ${g.toFixed(2)}, risk ${c.risk.hours} h, pair hours ${c.pairHours}`);
    }
    continue;
  }
  const full = coverSlackPass(ctx, start, { price, pairPrice: pair, onMove: (m) => curve.push({ ...m, t: performance.now() - t0 }) });
  const tFull = performance.now() - t0;
  // The starting objective: rebuild it from the pass with no move allowed (rounds 0) so it uses the same walks.
  let tn = performance.now();
  const none = coverSlackPass(ctx, start, { price, pairPrice: pair, rounds: 0 });
  tn = performance.now() - tn; // the starting roster's own walks, which run before the cap's clock starts
  const J0 = J(none.score, none.risk.hours, none.pairHours), Jf = J(full.score, full.risk.hours, full.pairHours);
  const gain = J0 - Jf;
  const pct = (j) => (gain > 1e-9 ? (100 * (J0 - j) / gain).toFixed(1) + "%" : "n/a");
  console.log(`WEEK ${size} week ${wk} (${slots.length} copies): uncapped ${full.moves} moves in ${(tFull / 1000).toFixed(1)} s, objective ${J0.toFixed(2)} -> ${Jf.toFixed(2)} (gain ${gain.toFixed(2)}), starting walks ${(tn / 1000).toFixed(1)} s (before the cap's clock), risk ${none.risk.hours} -> ${full.risk.hours} h, pair hours ${none.pairHours} -> ${full.pairHours}`);
  for (const m of curve) console.log(`  move ${m.moves} at ${(m.t / 1000).toFixed(2)} s: gain kept ${pct(J(m.score, m.riskHours, m.pairHours))}, risk ${m.riskHours} h, pair hours ${m.pairHours}`);
  for (const cap of caps) {
    t0 = performance.now();
    const c = coverSlackPass(ctx, start, { price, pairPrice: pair, pairMs: cap });
    const tc = performance.now() - t0;
    const k = c.moves === 0 ? 0 : curve.findIndex((m) => m.owner.join() === c.owner.join()) + 1;
    const prefix = c.moves === 0 ? c.owner.join() === start.join() : k === c.moves;
    console.log(`  cap ${(cap / 1000).toFixed(1)} s: ${(tc / 1000).toFixed(1)} s wall, ${c.moves} moves, timed out ${c.pairTimedOut}, prefix of uncapped ${prefix}, gain kept ${pct(J(c.score, c.risk.hours, c.pairHours))}, risk ${c.risk.hours} h, pair hours ${c.pairHours}`);
  }
}
