// Run: node eval/drape-arms-down.mjs [garment,...] [size,...]
// Arms held out (sewn and settled at 45 degrees) against arms lowered after
// sewing (`lowerArms: true`: sewn at 45, swung down over 0.8 s to hangAngleDeg,
// the lowest angle that leaves 1.2 cm between arm and torso below the armpit,
// then settled). One body: chest 100, waist 88, hip 98, height 178 cm; upper
// arm and wrist assumed 31 and 16.5 cm. Also the neckline diagnosis of
// 2026-11-13: the deltoid's height, the contact friction and a higher arm.
//   neck3: area-mean course stretch of body-panel cloth within 3 cm of the HPS
//   ride:  highest body-panel point above the HPS (cm)
import { drapeGarment, hangAngleDeg, bodyModel } from "../drape.mjs";

const me = { chest: 100, waist: 88, hip: 98, height: 178 };
const garments = (process.argv[2] || "tee,longsleeve,hoodie").split(",");
const sizes = (process.argv[3] || "S,M,L").split(",");
const diag = !process.argv[2];

function neck(r, within = 0.03) {
  let A = 0, E = 0;
  const T = r.cloth.triOffs[2] ?? r.cloth.tris.length;
  for (let q = 0; q < T; q++) {
    const t = r.cloth.tris[q], y = (r.pos[3 * t[0] + 1] + r.pos[3 * t[1] + 1] + r.pos[3 * t[2] + 1]) / 3;
    if (r.body.hps - y > within) continue;
    A += r.strain[q].area; E += r.strain[q].area * r.strain[q].ex;
  }
  return Math.round(1000 * E / A) / 10;
}
function ride(r) {
  const nT = r.cloth.offs[2] ?? r.cloth.n;
  let top = -Infinity;
  for (let i = 0; i < nT; i++) top = Math.max(top, r.pos[3 * i + 1]);
  return Math.round((top - r.body.hps) * 1000) / 10;
}
function row(label, r, ms) {
  const s = r.sleeves[0], lv = s ? Object.fromEntries(s.levels.map(l => [l.where, l])) : {};
  const b = lv.bicep;
  return `| ${label} | ${r.body.armAngleDeg} | ${neck(r)} | ${ride(r)} | ${r.levels[0].hoopStrainPct} | ${b ? `${b.hoopStrainPct} / ${b.maxHoopStrainPct}` : "-"} | ${s ? s.cuffPastWristCm : "-"} | ${r.checks.hemDropCm} | ${r.checks.seamGapCm} | ${r.checks.verticesInsideBody} | ${r.checks.settled ? "yes" : "no"} | ${ms} |`;
}

console.log(`Hang angle for this body: ${hangAngleDeg(bodyModel(me))} degrees\n`);
console.log("| run | arm angle | neck3 % | ride (cm) | chest % | bicep % mean / peak | cuff past wrist (cm) | hem drop (cm) | seam gap (cm) | inside | settled | ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const garment of garments) for (const size of sizes) for (const lowerArms of [false, true]) {
  const t = Date.now();
  const r = drapeGarment(me, { garment, size, lowerArms });
  console.log(row(`${garment} ${size} ${lowerArms ? "arms lowered" : "arms out"}`, r, Date.now() - t));
}
if (diag) {
  const runs = [
    ["tee M panels only", { sleeves: false }],
    ["tee M deltoid top flush with the shoulder (dJ 0.9, dR 1.0)", { deltoid: { dJ: 0.9, dR: 1.0 } }],
    ["tee M friction 0.05 (default 0.4)", { simOpts: { friction: 0.05 } }],
    ["tee M arms at 60", { armAngleDeg: 60 }],
    ["tee M settle 4 s", { settleTime: 4 }],
  ];
  for (const [label, o] of runs) { const t = Date.now(); console.log(row(label, drapeGarment(me, { size: "M", ...o }), Date.now() - t)); }
}
