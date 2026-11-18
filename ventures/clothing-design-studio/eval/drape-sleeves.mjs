// Run: node eval/drape-sleeves.mjs
// Sleeves sewn into the drape on one body (chest 100, waist 88, hip 98, height
// 178 cm; upper arm and wrist assumed 31 and 16.5 cm), arms held 30 degrees out.
// "before" reproduces the pre-2026-11-13 sleeve width (the flat bicep drawn as the
// full width: bicepCm = half the drafted flat figure) at the corrected length;
// "after" is the drafted sleeve now. The old over-long sleeve length is shown from
// the cap height, which the old draft added on top of the stated length.
import { drapeGarment } from "../drape.mjs";
import { draft } from "../pattern.mjs";
import { BODY_CHEST_CM } from "../fit.mjs";

const me = { chest: 100, waist: 88, hip: 98, height: 178 };
const rows = [];
for (const garment of ["tee", "longsleeve", "hoodie"]) for (const size of ["S", "M", "L"]) {
  const d = draft(garment, size).checks;
  // old full width = 0.22 bc + 0.1 (chest - bc) + 1; new flat = 0.17 bc + 0.1 (chest - bc)
  const bc = BODY_CHEST_CM[size], oldGirth = d.sleeveBicepGirthCm / 2 + 0.05 * bc + 1;
  for (const [label, pattern] of [["old width", { bicepCm: oldGirth / 2 }], ["drafted now", {}]]) {
    const t = Date.now();
    const r = drapeGarment(me, { garment, size, pattern });
    const s = r.sleeves[0], lv = Object.fromEntries(s.levels.map(l => [l.where, l]));
    rows.push({ garment, size, label, girth: r.draft.checks.sleeveBicepGirthCm, cap: r.draft.checks.capHeightCm, bicep: lv.bicep.hoopStrainPct, bicepMax: lv.bicep.maxHoopStrainPct, touch: lv.bicep.touchingPct, cuff: s.cuffPastWristCm, gap: r.checks.seamGapCm, inside: r.checks.verticesInsideBody, settled: r.checks.settled, chest: r.levels[0].hoopStrainPct, ms: Date.now() - t });
  }
}
console.log("| garment | size | sleeve | bicep girth (cm) | cap (cm) | bicep stretch % | most stretched % | touching % | cuff past wrist (cm) | chest stretch % | seam gap (cm) | inside | settled | ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.garment} | ${r.size} | ${r.label} | ${r.girth} | ${r.cap} | ${r.bicep} | ${r.bicepMax} | ${r.touch} | ${r.cuff} | ${r.chest} | ${r.gap} | ${r.inside} | ${r.settled ? "yes" : "no"} | ${r.ms} |`);
