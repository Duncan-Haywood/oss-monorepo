// Run: node eval/drape-sizes.mjs
// Every drafted size and fit of the tee, crewneck and hoodie draped on one body
// (chest 100, waist 88, hip 98, height 178 cm), compared with the tape
// arithmetic of fit.mjs (garment chest minus body chest).
import { drapeGarment } from "../drape.mjs";
import { garmentMeasurements } from "../fit.mjs";

const me = { chest: 100, waist: 88, hip: 98, height: 178 };
const rows = [];
for (const garment of ["tee", "crewneck", "hoodie"]) for (const fit of ["slim", "regular"]) for (const size of ["XS", "S", "M", "L"]) {
  const t = Date.now();
  const r = drapeGarment(me, { garment, fit, size, sleeves: false }); // body panels only, as measured on 2026-11-13 before sleeves
  const gm = garmentMeasurements(garment, fit)[size];
  const lv = Object.fromEntries(r.levels.map(l => [l.where, l]));
  rows.push({ garment, fit, size, tapeEase: Math.round((gm.chest - me.chest) * 10) / 10, chestStrain: lv.chest.hoopStrainPct, chestClear: lv.chest.clearanceCm, chestTouch: lv.chest.touchingPct, chestMmHg: lv.chest.pressureMmHg, hemStrain: lv.hem.hoopStrainPct, hemRise: -r.checks.hemDropCm, seamGap: r.checks.seamGapCm, inside: r.checks.verticesInsideBody, settled: r.checks.settled, ms: Date.now() - t });
}
console.log("| garment | fit | size | tape ease at chest (cm) | chest stretch % | chest clearance (cm) | chest touching % | chest pressure (mmHg) | hem stretch % | hem higher than flat (cm) | seam gap (cm) | settled | ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.garment} | ${r.fit} | ${r.size} | ${r.tapeEase} | ${r.chestStrain} | ${r.chestClear} | ${r.chestTouch} | ${r.chestMmHg} | ${r.hemStrain} | ${r.hemRise} | ${r.seamGap} | ${r.settled ? "yes" : "no"} | ${r.ms} |`);
