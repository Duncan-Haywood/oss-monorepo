// Does the order-free pair check's priced pass open fewer hours when its rosters are played? (2026-11-15)
//
// README "An order-free pair check" left open: "play the order-free pass's rosters through seeded weeks of call-outs (as
// 'The pair price in played weeks' did) to see whether its lower count opens fewer hours". This script does that, on the
// same seeded weeks, seeds and call-out draw as eval/pair-played-big.mjs.
//
// For each week the plain roster is built once (seed 1). Then, from that same roster:
//   cover = coverSlackPass with $PRICE an hour at risk (--cover-price)
//   old   = the same plus $PAIR a clashing-pair hour, old (order-dependent) check, confirmed at 200,000 checks
//   free  = the same with the order-free check (--second-callout-order-free), confirmed at 2,000,000 checks
// Every roster is played through the same seeded weeks of call-outs (5pm notice the day before, started shifts pinned, kept
// reissues; playFrom in eval/steady-for-callouts.mjs). Reported per roster: open hours the week's events add, changes to others,
// premiums owed; paired per-week comparisons free vs old and free vs cover, with a two-sided sign test on the weeks that differ.
// Rosters that came out identical are played once.
//   node eval/pair-order-free-played.mjs [seeds=40]   SIZES=20x56,40x112  WEEKS=3  ONLY=<label substrings>  PRICE=25  PAIR=1
//     CALL=0.01,0.084  BUILD_ONLY=1 (print the builds and stop)
import { pathToFileURL } from "node:url";
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass, coverPairRisk, rosterFromOwner } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";
import { drawWeek } from "./real-rate-week.mjs";
import { playFrom } from "./steady-for-callouts.mjs";

// Two-sided sign test: P(at least this lopsided | p = 1/2), ties dropped.
export function signP(a, b) {
  const m = a + b;
  if (!m) return 1;
  const k = Math.min(a, b);
  let c = 0, term = Math.exp(-m * Math.LN2);
  for (let i = 0; i <= k; i++) { c += term; term *= (m - i) / (i + 1); }
  return Math.min(1, 2 * c);
}

const BASE = { minRestHours: 10 };

async function main() {
  const seeds = Number(process.argv[2] || 40);
  const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1), n = Number(process.env.WEEKS ?? 3);
  const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
  const buildOnly = process.env.BUILD_ONLY === "1";
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
    const tb = [];
    const timed = (f) => { const t = performance.now(); const r = f(); tb.push(((performance.now() - t) / 1000).toFixed(1)); return r; };
    const pc = timed(() => coverSlackPass(ctx, plain.owner, { price }));
    const po = timed(() => coverSlackPass(ctx, plain.owner, { price, pairPrice: pair, pairConfirm: 200000 }));
    const pf = timed(() => coverSlackPass(ctx, plain.owner, { price, pairPrice: pair, pairOrderFree: true, pairConfirm: 2000000 }));
    const asRoster = (owner) => {
      const r = rosterFromOwner(staff, slots, owner, BASE);
      if (!r.ok) throw new Error(`${label}: ${r.error}`);
      return r;
    };
    // Both yardsticks, run to the end: old at 1,000,000 steps a pair, order-free at 2,000,000.
    const oldH = (owner) => coverPairRisk(ctx, owner, { budget: 1e6 }).hours;
    const freeH = (owner) => coverPairRisk(ctx, owner, { budget: 2e6, orderFree: true }).hours;
    const rosters = [
      { name: `cover $${price}`, out: pc },
      { name: `+ pair $${pair} old`, out: po },
      { name: `+ pair $${pair} order-free`, out: pf },
    ].map((x) => ({ ...x, r: asRoster(x.out.owner), oldH: oldH(x.out.owner), freeH: freeH(x.out.owner) }));
    const key = (x) => x.r.owner.join();
    console.log(`BUILD ${label} (${slots.length} copies, ${((performance.now() - t0) / 1000).toFixed(1)} s; passes ${tb.join(" / ")} s): plain score ${plain.score.toFixed(2)}, open ${plain.unfilledHours} h, pair hours old ${oldH(plain.owner)} / free ${freeH(plain.owner)}`
      + rosters.map((x) => ` | ${x.name}: ${x.out.moves} moves, score +${(x.out.score - plain.score).toFixed(2)}, risk ${x.out.risk.hours} h, pair hours old ${x.oldH} / free ${x.freeH}, payroll $${x.r.cost.toFixed(2)}`).join("")
      + ` | free = old: ${key(rosters[2]) === key(rosters[1])}, free = cover: ${key(rosters[2]) === key(rosters[0])}`);
    if (buildOnly) continue;
    if (key(rosters[2]) === key(rosters[1])) { console.log(`PLAY ${label}: order-free roster = old pair roster, nothing to compare`); continue; }
    const distinct = [];
    for (const x of rosters) { const d = distinct.find((y) => key(y) === key(x)); x.as = d ? d.name : null; if (!d) distinct.push(x); }
    const idx = (x) => distinct.findIndex((y) => key(y) === key(x));
    for (const call of calls) {
      const tot = distinct.map(() => ({ added: 0, changes: 0, owed: 0, reissues: 0, proven: 0 }));
      const cmpOld = { fewer: 0, same: 0, more: 0 }, cmpCover = { fewer: 0, same: 0, more: 0 };
      let disrupted = 0;
      const tp = performance.now();
      for (let s = 0; s < seeds; s++) {
        const events = drawWeek(slots, staff, { call, extra: 0, seed: 20261115 + s * 7919 + Math.round(call * 1e4) * 31 });
        if (!events.length) continue;
        disrupted++;
        const res = distinct.map((x) => playFrom(stf, shf, x.r, events, BASE));
        res.forEach((p, k) => { for (const f of Object.keys(tot[k])) tot[k][f] += p[f]; });
        const f = res[idx(rosters[2])].added;
        for (const [cmp, other] of [[cmpOld, rosters[1]], [cmpCover, rosters[0]]]) {
          const o = res[idx(other)].added;
          cmp[f < o ? "fewer" : f > o ? "more" : "same"]++;
        }
      }
      for (const [k, x] of distinct.entries()) {
        const also = rosters.filter((y) => y.as === x.name).map((y) => y.name);
        console.log(`PLAY ${label} call ${call} ${x.name}${also.length ? ` (= ${also.join(", ")})` : ""}: ${disrupted} disrupted weeks, open hours added ${tot[k].added}, changes to others ${tot[k].changes}, premiums $${tot[k].owed.toFixed(2)}, proven ${tot[k].proven}/${tot[k].reissues}`);
      }
      console.log(`CMP ${label} call ${call} order-free vs old: fewer added hours in ${cmpOld.fewer} weeks, same ${cmpOld.same}, more ${cmpOld.more} (p ${signP(cmpOld.fewer, cmpOld.more).toFixed(3)})`
        + ` | order-free vs cover: fewer ${cmpCover.fewer}, same ${cmpCover.same}, more ${cmpCover.more} (p ${signP(cmpCover.fewer, cmpCover.more).toFixed(3)}) (${((performance.now() - tp) / 1000).toFixed(0)} s)`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
