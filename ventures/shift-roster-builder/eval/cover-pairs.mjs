// Moving two shifts together inside --cover-price (2026-11-13 later).
//
// The priced pass (coverSlackPass) tried one hand-over or one swap of the risky person's own shift. Its README sections
// left "moving two shifts together" open: when everyone who could take a risky shift is full, the stand-in has to give one
// of theirs away first. `pairs` (default on, `coverPairs: false` turns it off) adds two moves: a relief (the stand-in's
// shift j goes to a third person r, so the stand-in is free to cover) and a relay (the risky shift i goes to the stand-in
// and j goes to r). This compares the pass with and without them, starting from the same roster:
//   templates: risk before -> after, moves (single / relief / relay), score paid, the posted roster's calloutExposure;
//   seeded 20-, 40- and 60-person weeks: risk (strict, two passes, no budget), moves, score paid, time.
// Then, for templates where the pairs posted a different roster, the seeded call-out weeks of eval/cover-price.mjs.
//   node eval/cover-pairs.mjs [seeds=20]   PRICES=25,100   SIZES=20x56x3,40x112x3,60x168x1   CALL=0.01,0.084
import { parseStaff, parseShifts, buildRoster, buildContext, coverRisk, coverSlackPass, calloutExposure, rosterCsv } from "../calc.mjs";
import { drawWeek, sets } from "./real-rate-week.mjs";
import { playFrom } from "./steady-for-callouts.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const seeds = Number(process.argv[2] || 20);
const prices = (process.env.PRICES || "25,100").split(",").map(Number);
const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
const SIZES = (process.env.SIZES ?? "20x56x3,40x112x3,60x168x1").split(",").filter(Boolean).map((s) => s.split("x").map(Number));
const fmt = (o) => `${o.moves} moves (${o.moves - o.pairMoves - o.relieves - o.trades} single, ${o.relieves} relief, ${o.trades} trade, ${o.pairMoves} relay) of ${o.tried} tried`;

const all = sets();
for (const name of (process.env.SETS ?? Object.keys(all).join(",")).split(",").filter(Boolean)) {
  const [stf, shf] = all[name];
  const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
  const plain = buildRoster(staff, slots, BASE);
  const exp0 = calloutExposure(staff, slots, plain, BASE).exposure;
  const play = [{ label: "default", r: plain, exposure: exp0 }];
  for (const price of prices) {
    for (const pairs of [false, true]) {
      const t0 = Date.now();
      const r = buildRoster(staff, slots, { ...BASE, coverPrice: price, coverPairs: pairs });
      const ms = Date.now() - t0;
      const cs = r.coverSlack;
      const x = calloutExposure(staff, slots, r, BASE).exposure;
      console.log(`TEMPLATE ${name} price ${price} pairs ${pairs ? "on" : "off"}: risk ${cs.riskHoursBefore} -> ${cs.riskHours} h (${cs.riskyDaysBefore} -> ${cs.riskyDays} of ${cs.personDays} days), ${fmt({ moves: cs.moves, pairMoves: cs.pairMoves, relieves: cs.relieves, trades: cs.trades, tried: cs.candidates })}, score +${(r.score - plain.score).toFixed(2)}, payroll $${plain.cost.toFixed(2)} -> $${r.cost.toFixed(2)}, open ${r.unfilledHours} h, exposure ${exp0} -> ${x} h, build ${ms} ms`);
      const csv = rosterCsv(r);
      if (cs.moves > 0 && !play.some((p) => rosterCsv(p.r) === csv)) play.push({ label: `price ${price} pairs ${pairs ? "on" : "off"}`, r, exposure: x });
    }
  }
  if (!play.some((p) => p.label.includes("pairs on"))) { console.log(`PLAY ${name}: the pairs posted no roster the single moves did not, nothing to play`); continue; }
  for (const call of calls) {
    const tot = play.map(() => ({ added: 0, changes: 0, owed: 0 }));
    let weeks = 0;
    for (let s = 0; s < seeds; s++) {
      const events = drawWeek(slots, staff, { call, extra: 0, seed: 20261113 + s * 7919 + Math.round(call * 1e4) * 31 });
      if (!events.length) continue;
      weeks++;
      play.forEach((b, k) => { const p = playFrom(stf, shf, b.r, events); for (const f of Object.keys(tot[k])) tot[k][f] += p[f]; });
    }
    play.forEach((b, k) => console.log(`PLAY ${name} call ${call} ${b.label} (exposure ${b.exposure} h, payroll $${b.r.cost.toFixed(2)}): ${weeks} disrupted weeks, open hours added ${tot[k].added}, changes to others ${tot[k].changes}, premiums $${tot[k].owed.toFixed(2)}`));
  }
}

for (const [P, S, n] of SIZES) {
  seededWeeks(P, S, n).forEach(({ staff: st, shifts: sh }, w) => {
    const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
    const r = buildRoster(staff, slots, BASE);
    const ctx = buildContext(staff, slots, BASE);
    const strict = (owner) => coverRisk(ctx, owner, { chain: 2, budget: Infinity }).hours;
    const start = strict(r.owner);
    const line = [];
    for (const price of prices) for (const pairs of [false, true]) {
      const t0 = performance.now();
      const out = coverSlackPass(ctx, r.owner, { price, pairs });
      const ms = performance.now() - t0;
      line.push(`$${price} pairs ${pairs ? "on" : "off"}: ${fmt(out)}, risk ${start} -> ${strict(out.owner)} h, score +${(out.score - r.score).toFixed(2)}, ${ms.toFixed(0)} ms`);
    }
    console.log(`WEEK ${P}x${S} week ${w} (${slots.length} copies): ${line.join("; ")}`);
  });
}
