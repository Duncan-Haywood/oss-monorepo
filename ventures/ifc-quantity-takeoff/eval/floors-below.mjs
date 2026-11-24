// Rooms whose real floor lies below their solid (rooms.mjs, floorsBelow): for
// every model, the rooms found, how deep, over what share of the plan, the
// wall band added to the gross wall area, and the doors and windows whose
// cut at the room's floor this changes.
//
//   node eval/floors-below.mjs <model.ifc>... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = [];
const f2 = (v) => (v == null ? "-" : v.toFixed(2));
for (const file of args) {
  const t0 = Date.now();
  const r = takeoff(parseStep(readFileSync(file)));
  const res = { model: basename(file), rooms: 0, sunken: [], band: 0, gross: 0, cut: 0 };
  for (const q of r.rooms) {
    const c = q.computed;
    if (!c || c.wallArea == null) continue;
    res.rooms++; res.gross += c.wallArea; res.cut += c.openingCut ?? 0;
    if (!c.floorBelow) continue;
    res.band += c.floorBelow.bandArea;
    res.sunken.push({ id: q.id, room: q.label, storey: q.storey, drop: +c.floorBelow.drop.toFixed(3), share: +c.floorBelow.share.toFixed(3), edgeShare: +c.floorBelow.edgeShare.toFixed(3), bandArea: +c.floorBelow.bandArea.toFixed(2), solidWallArea: +c.solidWallArea.toFixed(2), slabs: c.floorBelow.slabs });
  }
  out.push(res);
  console.log(`\n${res.model}: ${res.rooms} rooms measured, ${res.sunken.length} with a floor below the solid; band added ${f2(res.band)} m2 to ${f2(res.gross - res.band)} m2 gross wall; openings cut at floor or ceiling now ${f2(res.cut)} m2 (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const s of res.sunken) console.log(`  #${s.id} ${s.room} (${s.storey}): floor ${s.drop} m below over ${(s.share * 100).toFixed(0)}% of the plan, ${(s.edgeShare * 100).toFixed(0)}% of the outline; +${s.bandArea} m2 on ${s.solidWallArea} m2; slabs ${s.slabs.map((x) => "#" + x).join(" ")}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
