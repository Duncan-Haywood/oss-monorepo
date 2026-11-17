// What does a manager buy by pricing call-out slack into the roster? (2026-11-13)
//
// `--steady` (eval/steady-for-callouts.mjs) picks the least-exposed of the rosters that already tie at the best score, so
// it gives up nothing. The open question it left, in the README's words: "exposure as a term inside the search (a slack
// price against payroll), which would trade score for steadiness instead of choosing among ties."
//
// `coverPrice` (CLI --cover-price) is that term: dollars per hour at risk, where a person-day is at risk when nobody else
// could take that person's shifts that day with every hard rule holding and nobody else moved (coverRisk). This script
// sweeps the price on each template and reports, for every price:
//   risk hours (the priced quantity), the real calloutExposure of the roster it posts, its payroll and its score,
// so the cheap term can be checked against the slow measurement it stands in for. Then, at the prices that moved a roster,
// it plays the same seeded weeks of call-outs as eval/steady-for-callouts.mjs (5pm notice, started shifts pinned, kept
// reissues) against the priced roster and against the default one, and reports the open hours the week's events add.
// Arithmetic on invented teams with rates from one real file (eval/real-rate-week.mjs header).
//   node eval/cover-price.mjs [seeds=20]   SETS=cafe,spare,salon,retail,clinic  PRICES=0,25,50,100,200,400  CALL=0.01,0.084  EXTRA=0  PAIR=<$>
import { parseStaff, parseShifts, buildRoster, calloutExposure, coverSlackText } from "../calc.mjs";
import { drawWeek, sets } from "./real-rate-week.mjs";
import { playFrom } from "./steady-for-callouts.mjs";
import { pathToFileURL } from "node:url";

const BASE = { minRestHours: 10 };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] || 20);
  const all = sets();
  const pick = (process.env.SETS || Object.keys(all).join(",")).split(",");
  const prices = (process.env.PRICES || "0,25,50,100,200,400").split(",").map(Number);
  const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
  const extrasR = (process.env.EXTRA || "0").split(",").map(Number);
  for (const name of pick) {
    const [stf, shf] = all[name];
    const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
    const built = [];
    for (const price of prices) {
      const t0 = Date.now();
      // PAIR=<$> (2026-11-14) also prices second call-outs (coverPairPrice) on every priced build.
      const r = buildRoster(staff, slots, { ...BASE, coverPrice: price, ...(price > 0 && process.env.PAIR ? { coverPairPrice: Number(process.env.PAIR) } : {}) });
      const x = calloutExposure(staff, slots, r, BASE);
      const cs = r.coverSlack;
      built.push({ price, r, exposure: x.exposure });
      console.log(`BUILD ${name} price ${price}: score ${r.score.toFixed(2)}, payroll $${r.cost.toFixed(2)}, open ${r.unfilledHours} h, risk ${cs ? cs.riskHours : "n/a"} h on ${cs ? cs.riskyDays : "n/a"}/${cs ? cs.personDays : "n/a"} person-days, moves ${cs ? cs.moves : 0} of ${cs ? cs.candidates : 0} candidates, exposure ${x.exposure} h, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      if (cs) console.log(`  ${coverSlackText(cs, staff)}`);
    }
    // Only the prices that changed the roster are worth playing; the rest are the default roster again.
    const base = built[0];
    const moved = built.filter((b) => b.price > 0 && b.r.coverSlack?.moves > 0);
    const seen = new Set();
    const play = [base, ...moved.filter((b) => { const k = b.r.owner.join(","); if (seen.has(k) || k === base.r.owner.join(",")) return false; seen.add(k); return true; })];
    if (play.length < 2) { console.log(`PLAY ${name}: no price moved the roster, nothing to play`); continue; }
    for (const call of calls) for (const extra of extrasR) {
      const tot = play.map(() => ({ added: 0, changes: 0, owed: 0, reissues: 0, proven: 0 }));
      let weeks = 0;
      for (let s = 0; s < seeds; s++) {
        const events = drawWeek(slots, staff, { call, extra, seed: 20261113 + s * 7919 + Math.round(call * 1e4) * 31 + Math.round(extra * 1e4) * 17 });
        if (!events.length) continue;
        weeks++;
        play.forEach((b, k) => {
          const p = playFrom(stf, shf, b.r, events);
          for (const f of Object.keys(tot[k])) tot[k][f] += p[f];
        });
      }
      for (const [k, b] of play.entries()) {
        console.log(`PLAY call ${call} extra ${extra} ${name} price ${b.price} (risk ${b.r.coverSlack ? b.r.coverSlack.riskHours : "n/a"} h, exposure ${b.exposure} h, payroll $${b.r.cost.toFixed(2)}): ${weeks} disrupted weeks, open hours added ${tot[k].added}, changes to others ${tot[k].changes}, premiums $${tot[k].owed.toFixed(2)}, proven ${tot[k].proven}/${tot[k].reissues}`);
      }
    }
  }
}
