// Run: node eval/drape-soft-torso.mjs [garment,...] [size,...] [softCm,...]
// Table and reading: eval/drape-soft-torso-2026-11-16.md
// The soft torso (2026-11-16): sewn at 45 degrees, arms lowered after sewing to
// hangAngleDeg for a side that gives softTissueCm where the arm presses, then
// settled. 0 is the rigid ellipse body of 2026-11-13. One body: chest 100,
// waist 88, hip 98, height 178 cm; upper arm and wrist assumed 31 and 16.5 cm.
//   worst: the most stretched sleeve triangle (%), the underarm where cap meets side
import { drapeGarment, hangAngleDeg, bodyModel } from "../drape.mjs";

const me = { chest: 100, waist: 88, hip: 98, height: 178 };
const garments = (process.argv[2] || "tee,longsleeve,hoodie").split(",");
const sizes = (process.argv[3] || "S,M,L").split(",");
const softs = (process.argv[4] || "0,2,3,4").split(",").map(Number);

console.log(`Hang angle by softness: ${softs.map(s => `${s} cm ${hangAngleDeg(bodyModel(me, { softTissueCm: s }))} deg`).join(", ")}\n`);
console.log("| run | soft (cm) | arm angle | chest % | bicep % mean / peak | worst sleeve triangle % | cuff past wrist (cm) | hem drop (cm) | seam gap (cm) | inside | settled | ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const garment of garments) for (const size of sizes) {
  for (const soft of [-1, ...softs]) {
    const t = Date.now();
    const r = drapeGarment(me, soft < 0 ? { garment, size } : { garment, size, lowerArms: true, softTissueCm: soft });
    const s = r.sleeves[0], b = s.levels.find(l => l.where === "bicep");
    let worst = 0;
    for (let q = r.cloth.triOffs[2]; q < r.cloth.tris.length; q++) worst = Math.max(worst, r.strain[q].ex);
    console.log(`| ${garment} ${size} ${soft < 0 ? "arms out" : "lowered"} | ${soft < 0 ? "-" : soft} | ${r.body.armAngleDeg} | ${r.levels[0].hoopStrainPct} | ${b.hoopStrainPct} / ${b.maxHoopStrainPct} | ${Math.round(worst * 100)} | ${s.cuffPastWristCm} | ${r.checks.hemDropCm} | ${r.checks.seamGapCm} | ${r.checks.verticesInsideBody} | ${r.checks.settled ? "yes" : "no"} | ${Date.now() - t} |`);
  }
}
