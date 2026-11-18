// The second-call-out price with and without the confirming pair walk (2026-11-15, README "Fewer capped pairs").
// For each week: the --cover-price roster, then --second-callout-price with the budgeted pair walk alone (coverPairConfirm:
// false, the 2026-11-14 behaviour) and with the confirm on (the default now). Reported: pass time, moves, score, risk hours,
// and the pair hours of each posted roster counted by the walk run to the end (1,000,000 checks a pair; capped pairs shown).
// Invented teams and seeded weeks, single runs on one machine.
//   node eval/pair-confirm.mjs     SIZES=20x56,40x112  WEEKS=3  PRICE=25  PAIR=1  SETS=spare,retail,cafe
import { parseStaff, parseShifts, buildRoster, buildContext, coverRisk, coverPairRisk } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";
import { sets } from "./real-rate-week.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1), n = Number(process.env.WEEKS ?? 3);
const weeks = [];
const all = sets();
for (const k of (process.env.SETS ?? "spare,retail,cafe").split(",").filter(Boolean)) weeks.push([k, ...all[k]]);
for (const size of (process.env.SIZES ?? "20x56,40x112").split(",").filter(Boolean)) {
  const [P, S] = size.split("x").map(Number);
  seededWeeks(P, S, n).forEach(({ staff, shifts }, w) => weeks.push([`${size} week ${w}`, staff, shifts]));
}
for (const [label, st, sh] of weeks) {
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  const runs = [["priced", { coverPrice: price }], ["pair, screen only", { coverPrice: price, coverPairPrice: pair, coverPairPriceSlots: Infinity, coverPairConfirm: false }], ["pair, confirmed", { coverPrice: price, coverPairPrice: pair, coverPairPriceSlots: Infinity }]];
  for (const [name, o] of runs) {
    const r = buildRoster(staff, slots, { ...BASE, ...o, seed: 1 });
    const one = coverRisk(ctx, r.owner, { budget: Infinity });
    const ex = coverPairRisk(ctx, r.owner, { budget: 1e6 });
    const cs = r.coverSlack || {};
    console.log(`${label} (${slots.length} copies) ${name}: pass ${r.timings?.coverSlack ?? "-"} ms, moves ${cs.moves ?? "-"}, score ${r.score.toFixed(2)}, risk ${one.hours} h, pair hours ${ex.hours} (${ex.capped} capped)${cs.pairHours != null ? `, reported ${cs.pairHoursBefore} -> ${cs.pairHours}${cs.pairConfirmed ? "" : " (screen)"}` : ""}`);
  }
}
