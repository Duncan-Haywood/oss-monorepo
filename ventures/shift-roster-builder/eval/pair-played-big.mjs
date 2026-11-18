// Does the second-call-out price pay off in played weeks on the bigger seeded rosters? (2026-11-15)
//
// README "A second call-out in the same week" played the pair price only on the five templates (spare café: a big win; retail:
// a wash) and left "the 40- and 60-person weeks' played result with the pair price" open. This script answers it for the
// seeded 20- and 40-person weeks the pair-price speed work used (eval/pair-stop.mjs).
//
// For each week the plain roster is built once (seed 1). Then, from that same roster:
//   priced   = coverSlackPass with $PRICE an hour at risk (what --cover-price does)
//   pair     = the same pass plus $PAIR a clashing-pair hour (what --second-callout-price adds), confirm and stop cuts on
// Starting both passes from one roster matters: the bigger weeks' builds are time-gated, so separate buildRoster calls can
// start from different rosters (README "Only the walks a move can pass").
// Each roster is then played through the same seeded weeks of call-outs as eval/cover-price.mjs (5pm notice the day before,
// started shifts pinned, kept reissues; playFrom in eval/steady-for-callouts.mjs). The draw is per person-day for the whole
// staff list, so the three rosters face the same people off on the same days (a caller who is not working that day in a
// roster is no call-out for it). Reported per roster: open hours the week's events add, changes to others, premiums owed.
// A paired comparison per seed is printed too (how many weeks the pair roster added fewer / the same / more open hours).
// Invented teams and seeded weeks; the rates are the real-file rates of eval/real-rate-week.mjs (1.0% sick-only, 8.4% all leave).
//   node eval/pair-played-big.mjs [seeds=40]   SIZES=20x56,40x112  WEEKS=3  ONLY=<label substrings, comma-separated>  PRICE=25  PAIR=1  CALL=0.01,0.084
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass, coverPairRisk, rosterFromOwner } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";
import { drawWeek } from "./real-rate-week.mjs";
import { playFrom } from "./steady-for-callouts.mjs";

const BASE = { minRestHours: 10 };
const seeds = Number(process.argv[2] || 40);
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1), n = Number(process.env.WEEKS ?? 3);
const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
const weeks = [];
for (const size of (process.env.SIZES ?? "20x56,40x112").split(",").filter(Boolean)) {
  const [P, S] = size.split("x").map(Number);
  seededWeeks(P, S, n).forEach(({ staff, shifts }, w) => weeks.push([`${size} week ${w}`, staff, shifts]));
}
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const [label, stf, shf] of weeks) {
  if (only && !only.some((o) => label.includes(o))) continue;
  const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
  const t0 = performance.now();
  const plain = buildRoster(staff, slots, { ...BASE, seed: 1 });
  const ctx = buildContext(staff, slots, BASE);
  const pr = coverSlackPass(ctx, plain.owner, { price });
  const pp = coverSlackPass(ctx, plain.owner, { price, pairPrice: pair });
  const asRoster = (owner) => {
    const r = rosterFromOwner(staff, slots, owner, BASE);
    if (!r.ok) throw new Error(`${label}: ${r.error}`);
    return r;
  };
  // Pair hours on one yardstick for all three: the walk run to the end (1,000,000 steps a pair, README "Fewer capped pairs").
  // They count only pairs of days that are each safe alone, so a roster with fewer risky days can show more pair hours.
  const full = (owner) => coverPairRisk(ctx, owner, { budget: 1e6 }).hours;
  const rosters = [
    { name: "plain", r: plain, moves: 0, pairHours: full(plain.owner), risk: pr.before.hours },
    { name: `cover $${price}`, r: asRoster(pr.owner), moves: pr.moves, pairHours: full(pr.owner), risk: pr.risk.hours, score: pr.score },
    { name: `+ pair $${pair}`, r: asRoster(pp.owner), moves: pp.moves, pairHours: full(pp.owner), risk: pp.risk.hours, score: pp.score },
  ];
  const same = rosters[1].r.owner.join() === rosters[2].r.owner.join();
  console.log(`BUILD ${label} (${slots.length} copies, ${((performance.now() - t0) / 1000).toFixed(1)} s): plain score ${plain.score.toFixed(2)}, open ${plain.unfilledHours} h, risk ${pr.before.hours} h, pair hours ${rosters[0].pairHours}`
    + ` | cover: ${pr.moves} moves, score +${(pr.score - plain.score).toFixed(2)}, risk ${pr.risk.hours} h, pair hours ${rosters[1].pairHours}`
    + ` | pair: ${pp.moves} moves, score +${(pp.score - plain.score).toFixed(2)}, risk ${pp.risk.hours} h, pair hours ${rosters[2].pairHours}${same ? " | pair roster = cover roster" : ""}`);
  if (same && rosters[1].moves === 0) { console.log(`PLAY ${label}: no pass moved the roster, nothing to play`); continue; }
  const play = same ? rosters.slice(0, 2) : rosters;
  for (const call of calls) {
    const tot = play.map(() => ({ added: 0, changes: 0, owed: 0, reissues: 0, proven: 0 }));
    const cmp = { fewer: 0, same: 0, more: 0 }; // last roster against the one before it, per disrupted week
    let disrupted = 0;
    const tp = performance.now();
    for (let s = 0; s < seeds; s++) {
      const events = drawWeek(slots, staff, { call, extra: 0, seed: 20261115 + s * 7919 + Math.round(call * 1e4) * 31 });
      if (!events.length) continue;
      disrupted++;
      const res = play.map((x) => playFrom(stf, shf, x.r, events, BASE));
      res.forEach((p, k) => { for (const f of Object.keys(tot[k])) tot[k][f] += p[f]; });
      const a = res[res.length - 2].added, b = res[res.length - 1].added;
      cmp[b < a ? "fewer" : b > a ? "more" : "same"]++;
    }
    for (const [k, x] of play.entries()) {
      console.log(`PLAY ${label} call ${call} ${x.name}${same && k === 1 ? " (= pair roster)" : ""} (moves ${x.moves}, risk ${x.risk} h, pair hours ${x.pairHours}, payroll $${x.r.cost.toFixed(2)}): ${disrupted} disrupted weeks, open hours added ${tot[k].added}, changes to others ${tot[k].changes}, premiums $${tot[k].owed.toFixed(2)}, proven ${tot[k].proven}/${tot[k].reissues}`);
    }
    console.log(`CMP ${label} call ${call} ${play[play.length - 1].name} vs ${play[play.length - 2].name}: fewer added hours in ${cmp.fewer} weeks, same ${cmp.same}, more ${cmp.more} (${((performance.now() - tp) / 1000).toFixed(0)} s)`);
  }
}
