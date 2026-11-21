// Net wall finish per room: doors, windows and curtain walls taken off each
// room's gross wall area (perimeter x height), and a check of the geometric
// fallback against the file's own space boundaries.
//
//   node eval/net-wall-finish.mjs <model.ifc>... [--json out.json]
//
// For every model: rooms measured, gross wall area, what came off and from
// where (boundary or geometry). On models whose space boundaries name doors
// and windows, each such opening is also placed by where it stands
// (openingSides, as for a file with no boundaries) and the rooms found are
// compared with the rooms the boundaries name; and each boundary surface's
// area is compared with the opening's stored OverallWidth x OverallHeight.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { openingSides, roomTests } from "../rooms.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = [];
const T = { rooms: 0, gross: 0, off: 0, glazed: 0, byBoundary: 0, byGeometry: 0, nested: 0, held: 0, same: 0, subset: 0, extra: 0, none: 0, areaPairs: 0, areaAgree: 0 };
for (const file of args) {
  const text = readFileSync(file);
  const t0 = Date.now();
  const r = takeoff(parseStep(text));
  const secs = (Date.now() - t0) / 1000;
  const res = { model: basename(file), secs, rooms: 0, gross: 0, off: 0, glazed: 0, byBoundary: 0, byGeometry: 0, nested: 0, openings: 0, facing: [0, 0, 0], held: { n: 0, same: 0, subset: 0, extra: 0, none: 0, misses: [] }, area: { n: 0, agree: 0, ratios: [] } };
  for (const rm of r.rooms) {
    const c = rm.computed;
    if (!c || c.wallArea == null) continue;
    res.rooms++; res.gross += c.wallArea; res.off += c.openingArea; res.glazed += c.glazedArea;
    res.byBoundary += c.openingsFrom.boundary; res.byGeometry += c.openingsFrom.geometry; res.nested += c.nestedPieces;
  }
  const tests = roomTests(r.rooms);
  for (const x of r.rows) {
    if (!/^IFC(DOOR|WINDOW)/.test(x.ifcType) || x.isAssembly) continue;
    res.openings++;
    res.facing[Math.min(2, (x.facesRooms || []).length)]++;
    if (x.facesFrom !== "boundary") continue;
    // held out: where would the geometry alone have put it?
    const want = new Set(x.facesRooms), got = new Set(openingSides(x, tests).map((q) => q.label));
    const h = res.held;
    h.n++;
    const inter = [...got].filter((l) => want.has(l)).length;
    if (inter === want.size && got.size === want.size) h.same++;
    else if (inter === got.size && got.size > 0) h.subset++; // found some of the rooms, none wrong
    else if (got.size === 0) h.none++;
    else { h.extra++; if (h.misses.length < 8) h.misses.push({ id: x.id, cls: x.ifcClass, name: x.name, file: [...want], geometry: [...got] }); }
    // boundary surface against the stored overall size
    for (const a of Object.values(x.boundaryAreas || {})) {
      const wh = x.overallArea;
      if (wh == null) continue;
      res.area.n++;
      const ratio = a / wh;
      if (Math.abs(ratio - 1) <= 0.02) res.area.agree++; else if (res.area.ratios.length < 400) res.area.ratios.push(+ratio.toFixed(3));
    }
  }
  out.push(res);
  for (const k of ["rooms", "gross", "off", "glazed", "byBoundary", "byGeometry", "nested"]) T[k] += res[k];
  T.held += res.held.n; T.same += res.held.same; T.subset += res.held.subset; T.extra += res.held.extra; T.none += res.held.none;
  T.areaPairs += res.area.n; T.areaAgree += res.area.agree;
  const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
  console.log(`\n${res.model} (${secs.toFixed(1)} s): ${res.rooms} rooms, gross wall ${res.gross.toFixed(1)} m2, openings off ${res.off.toFixed(1)} m2 (${pct(res.off, res.gross)}), curtain walls off ${res.glazed.toFixed(1)} m2; deductions by boundary ${res.byBoundary}, by geometry ${res.byGeometry}; pieces inside a larger one not taken twice ${res.nested}`);
  console.log(`  doors and windows ${res.openings}: facing no room ${res.facing[0]}, one ${res.facing[1]}, two ${res.facing[2]}`);
  if (res.held.n) console.log(`  geometry vs the file's boundaries, ${res.held.n} openings: same rooms ${res.held.same}, some of them and none wrong ${res.held.subset}, none found ${res.held.none}, a room the file does not name ${res.held.extra}`);
  for (const m of res.held.misses) console.log(`    #${m.id} ${m.cls} ${m.name ?? ""}: file ${JSON.stringify(m.file)}, geometry ${JSON.stringify(m.geometry)}`);
  if (res.area.n) console.log(`  boundary surface vs stored width x height: ${res.area.agree} of ${res.area.n} within 2%${res.area.ratios.length ? "; others' ratios (first 12) " + res.area.ratios.slice(0, 12).join(" ") : ""}`);
}
console.log(`\nAll: ${T.rooms} rooms, gross wall ${T.gross.toFixed(0)} m2, ${T.off.toFixed(0)} m2 of doors and windows and ${T.glazed.toFixed(0)} m2 of curtain wall off (${T.byBoundary} by boundary, ${T.byGeometry} by geometry; ${T.nested} nested pieces not taken twice)`);
console.log(`  geometry held out against boundaries: ${T.held} openings, same ${T.same}, subset ${T.subset}, none ${T.none}, wrong room ${T.extra}`);
console.log(`  boundary surface vs width x height: ${T.areaAgree} of ${T.areaPairs} within 2%`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ total: T, models: out }, null, 1));
