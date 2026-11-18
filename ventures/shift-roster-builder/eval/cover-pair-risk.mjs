// Two call-outs in one week: does the pair count (coverPairRisk) see what the played weeks saw? (2026-11-14)
//
// README "The caller can take a later shift" ended on: the priced café roster is less exposed to any one call-out, yet in
// played weeks with several call-outs it lost more hours (8 -> 16 at 1% sick-only, 155 -> 188 at 8.4% all-leave). This
// builds each team's default roster and its priced roster (coverPrice, single-call-out risk only), and for both reports
// single-call-out risk hours, the pairs of safe person-days that cannot both be covered (clashing pairs) and their hours,
// and the time the pair walk took.
//   node eval/cover-pair-risk.mjs      SETS=cafe,spare,salon,retail,clinic  PRICE=25  SEEDED=0
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
import { pathToFileURL } from "node:url";

const BASE = { minRestHours: 10 };

export function pairLine(staff, slots, r, opts = BASE) {
  const ctx = buildContext(staff, slots, opts);
  const one = coverRisk(ctx, r.owner);
  const t0 = performance.now();
  const two = coverPairRisk(ctx, r.owner, { single: one });
  const ms = performance.now() - t0;
  return { one, two, ms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = sets();
  const pick = (process.env.SETS || Object.keys(all).join(",")).split(",").filter(Boolean);
  const price = Number(process.env.PRICE ?? 25);
  for (const name of pick) {
    const [stf, shf] = all[name];
    const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
    for (const [label, opts] of [["default", BASE], [`priced ${price}`, { ...BASE, coverPrice: price, ...(process.env.PAIR ? { coverPairPrice: Number(process.env.PAIR) } : {}) }]]) {
      const r = buildRoster(staff, slots, opts);
      const { one, two, ms } = pairLine(staff, slots, r);
      console.log(`${name} ${label}: score ${r.score.toFixed(2)}, open ${r.unfilledHours} h, single risk ${one.hours} h on ${one.riskyDays}/${one.personDays} person-days; pairs of safe days ${two.pairs} (${two.safeDays} safe days), clashing ${two.clashing} (${(two.share * 100).toFixed(1)}%), ${two.hours} h, capped ${two.capped}, ${ms.toFixed(0)} ms`);
    }
  }
}
