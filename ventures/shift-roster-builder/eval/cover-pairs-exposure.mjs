// Do the two-shift moves' cleared risk hours show up in the slow measurement? (2026-11-13 later)
//
// eval/cover-pairs.mjs reports risk hours (coverRisk, an upper bound) before and after the priced pass with and without the
// two-shift moves on seeded weeks. This runs calloutExposure (every person-day Tue-Sun as a 5pm-before call-out and a kept
// rebuild) on the starting roster and on the roster each setting posts, for the weeks where the pairs moved anything.
//   node eval/cover-pairs-exposure.mjs   WEEKS=20x56x2,40x112x0   PRICE=25
import { parseStaff, parseShifts, buildRoster, calloutExposure } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE || 25);
const WEEKS = (process.env.WEEKS || "20x56x2,40x112x0").split(",").map((s) => s.split("x").map(Number));
for (const [P, S, w] of WEEKS) {
  const { staff: st, shifts: sh } = seededWeeks(P, S, w + 1)[w];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  // Built through buildRoster with the price set, so each roster is the one the CLI and page would post; the search before
  // the pass is seeded and deterministic, so all three start from the same roster.
  const r = buildRoster(staff, slots, BASE);
  const rows = [["start", r]];
  for (const pairs of [false, true]) {
    const p = buildRoster(staff, slots, { ...BASE, coverPrice: price, coverPairs: pairs });
    const cs = p.coverSlack;
    rows.push([`pairs ${pairs ? "on" : "off"} (${cs.moves} moves, risk ${cs.riskHoursBefore} -> ${cs.riskHours} h, score ${(p.score - r.score) >= 0 ? "+" : ""}${(p.score - r.score).toFixed(2)}, open ${p.unfilledHours} h)`, p]);
  }
  for (const [label, roster] of rows) {
    const t0 = Date.now();
    const x = calloutExposure(staff, slots, roster, BASE);
    console.log(`${P}x${S} week ${w} ${label}: exposure ${x.error ?? x.exposure} h over ${x.personDays ?? "?"} person-days, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
