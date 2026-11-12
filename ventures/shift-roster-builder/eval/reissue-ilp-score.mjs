// Score the change-count ILP's least-change rosters under the engine's own objective, next to the engine's reissue, to say
// why the engine kept more changes than the least. When the engine proved its roster best on its score, the ILP's roster
// must score no lower (pay, fairness or another term outweighs the keep bonus); a lower score would mean a broken proof.
// When the engine's roster is unproven (status bounded), a lower score for the ILP's roster means the search missed it.
// Each roster is scored by pinning every shift copy to its owner (`fixed:`) and building with the same options, so the
// one roster left is scored by the engine itself.
//   node eval/reissue-ilp-export.mjs 40 112 2 4 > r.json && python3 eval/reissue-ilp-check.py r.json --dump=ilp.json
//   node eval/reissue-ilp-score.mjs r.json ilp.json ["keep/shift 1"]
import { readFileSync } from "node:fs";
import { parseStaff, parseShifts, buildRoster, keepFromCsv } from "../calc.mjs";
import { VARIANTS } from "./reissue-posted.mjs";

const OPEN = "(nobody: open)";
export function scoreOwner(w, owner, extra) {
  const staff = parseStaff(w.src.staff).staff, slots = parseShifts(w.src.shifts).slots;
  const pinned = slots.map((s, i) => ({ ...s, fixed: owner[i] >= 0 ? staff[owner[i]].name : OPEN }));
  const r = buildRoster(staff, pinned, { ...w.src.base, ...extra, ...(extra.keepShift || extra.keepValue ? { keep: keepFromCsv(w.src.postedCsv) } : {}) });
  return { score: r.optimality?.bestScore ?? null, pay: r.cost, open: r.unfilledHours, same: r.owner.every((o, i) => o === owner[i]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const W = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const ilp = Object.fromEntries(JSON.parse(readFileSync(process.argv[3], "utf8")).map((d) => [`${d.set} ${d.case}`, d]));
  const v = process.argv[4] || "keep/shift 1";
  let n = 0, lower = 0, higher = 0, tie = 0;
  for (const w of W) {
    const d = ilp[`${w.set} ${w.case}`], e = w.engine[v];
    if (!d || e.changes <= d.changes) continue;
    n++;
    const a = scoreOwner(w, e.owner, VARIANTS[v]), b = scoreOwner(w, d.owner, VARIANTS[v]);
    const diff = b.score - a.score;
    if (diff < -1e-6) lower++; else if (diff > 1e-6) higher++; else tie++;
    console.log(`${w.set} ${w.case}: engine (${e.status}) ${e.changes} changes, score ${a.score?.toFixed(2)}, pay $${a.pay}, ${a.open} h open${a.same ? "" : " (re-pin differs)"}; ILP ${d.changes} changes, score ${b.score?.toFixed(2)}, pay $${b.pay}, ${b.open} h open${b.same ? "" : " (re-pin differs)"}; ILP minus engine: score ${diff.toFixed(2)}, pay ${(b.pay - a.pay).toFixed(2)}`);
  }
  console.log(`${n} weeks where ${v} made more changes than the least: the ILP's roster scores lower (better) on ${lower}, higher on ${higher}, the same on ${tie}`);
}
