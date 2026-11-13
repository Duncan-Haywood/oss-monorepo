// What the hand-over chains cost inside --cover-price on big weeks (2026-11-13 later).
//
// eval/cover-risk-joint.mjs measures how well each chain setting picks out the days a call-out really opens; this times the
// priced pass itself (coverSlackPass, $100 an hour at risk) on the seeded weeks the README quotes for the pass's cost:
// 20 x 56 and 40 x 112 (weeks 0-2) and 60 x 168 week 0 (eval/reissue-scale.mjs's generator). Each week is built once, with
// the defaults (exact check on), and every setting starts from that same roster, so the settings differ only in the check.
// Settings are "chain" or "chain/budget" (checks per person-day before a day counts at risk; "inf" = none; no budget given
// = the default). For each setting's posted roster, the strictest check (two passes, no budget) is asked too, beside what
// it says of the starting roster: did the moves clear risk that check also sees?
//   node eval/cover-chain-cost.mjs      CHAINS=0,2/inf,2  SIZES=20x56x3,40x112x3,60x168x1
import { parseStaff, parseShifts, buildRoster, buildContext, coverRisk, coverSlackPass } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const OPT = { minRestHours: 10 };
const CHAINS = (process.env.CHAINS || "0,2/inf,2").split(",").map((c) => { const [ch, b] = c.split("/"); return { chain: Number(ch), budget: b === undefined ? undefined : b === "inf" ? Infinity : Number(b), label: c }; });
const SIZES = (process.env.SIZES || "20x56x3,40x112x3,60x168x1").split(",").map((s) => s.split("x").map(Number));
for (const [P, S, n] of SIZES) {
  seededWeeks(P, S, n).forEach(({ staff: st, shifts: sh }, w) => {
    const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
    const r = buildRoster(staff, slots, OPT);
    const ctx = buildContext(staff, slots, OPT);
    const strict = (owner) => coverRisk(ctx, owner, { chain: 2, budget: Infinity }).hours;
    const start = strict(r.owner);
    const line = [];
    for (const { chain, budget, label } of CHAINS) {
      const cfg = { price: 100, chain, ...(budget === undefined ? {} : { budget }) };
      const t0 = performance.now();
      const out = coverSlackPass(ctx, r.owner, cfg);
      const before = out.before, capped = coverRisk(ctx, r.owner, cfg).capped;
      const ms = performance.now() - t0; // the capped count below is outside the timing
      const judged = out.moves > 0 ? `, strict ${start} -> ${strict(out.owner)} h` : "";
      line.push(`chain ${label}: risk ${before.hours} -> ${out.risk.hours} h (${before.riskyDays} -> ${out.risk.riskyDays} of ${before.personDays} days${capped ? `, ${capped} capped` : ""}), ${out.moves} moves of ${out.tried} tried, score +${(out.score - r.score).toFixed(2)}${judged}, ${ms.toFixed(0)} ms`);
    }
    console.log(`${P}x${S} week ${w} (${slots.length} copies, ${r.optimality?.status ?? "?"}, strict risk ${start} h): ${line.join("; ")}`);
  });
}
