// Doors and windows cut to the room's wall height: how far each opening that
// comes off a room's walls runs past the room's floor or ceiling, and how much
// area the cut (rooms.mjs, heightShare) keeps off the deduction.
//
//   node eval/opening-height-cut.mjs <model.ifc>... [--json out.json]
//
// For every model: deductions, how many pass the ceiling or floor by more than
// 1 cm (and by 1-5 cm, 5-30 cm, over 30 cm), the opening area before and after
// the cut, and the largest cuts with their room.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const bins = () => ({ "1-5cm": 0, "5-30cm": 0, ">30cm": 0 });
const bin = (d, b) => { if (d > 0.3) b[">30cm"]++; else if (d > 0.05) b["5-30cm"]++; else if (d > 0.01) b["1-5cm"]++; };
const out = [];
const T = { rooms: 0, gross: 0, off: 0, cut: 0, cutN: 0, net: 0 };
for (const file of args) {
  const r = takeoff(parseStep(readFileSync(file)));
  const rows = new Map(r.rows.map((x) => [x.id, x]));
  const res = { model: basename(file), rooms: 0, gross: 0, off: 0, cut: 0, cutN: 0, net: 0, pairs: 0, ambiguous: 0, above: bins(), below: bins(), wholly: 0, top: [] };
  for (const rm of r.rooms) {
    const c = rm.computed;
    if (!c || c.wallArea == null) continue;
    res.rooms++; res.gross += c.wallArea; res.off += c.openingArea; res.cut += c.openingCut; res.cutN += c.openingsCut; res.net += c.netWallArea;
  }
  // every (room, opening) pair the takeoff placed, by the labels it wrote
  // (labels repeat across storeys on some models: a pair whose label names
  // more than one room is counted as skipped, not guessed)
  const byLabel = new Map(), dup = new Set();
  for (const q of r.rooms) { if (byLabel.has(q.label)) dup.add(q.label); byLabel.set(q.label, q); }
  for (const x of rows.values()) {
    if (!/^IFC(DOOR|WINDOW)/.test(x.ifcType) || x.isAssembly || !x.box) continue;
    for (const l of x.facesRooms ?? []) {
      if (dup.has(l)) { res.ambiguous++; continue; }
      const q = byLabel.get(l);
      if (!q?.box || !q.computed) continue;
      res.pairs++;
      const up = x.box[5] - q.box[5], down = q.box[2] - x.box[2];
      bin(up, res.above); bin(down, res.below);
      if (x.box[2] >= q.box[5] - 0.01 || x.box[5] <= q.box[2] + 0.01) res.wholly++;
      if (up > 0.05 || down > 0.05) res.top.push({ id: x.id, cls: x.ifcClass, name: x.name, room: l, roomHeight: +(q.box[5] - q.box[2]).toFixed(2), openingHeight: +(x.box[5] - x.box[2]).toFixed(2), aboveCeiling: +up.toFixed(2), belowFloor: +down.toFixed(2) });
    }
  }
  res.top.sort((a, b) => Math.max(b.aboveCeiling, b.belowFloor) - Math.max(a.aboveCeiling, a.belowFloor));
  res.top = res.top.slice(0, 10);
  out.push(res);
  for (const k of Object.keys(T)) T[k] += res[k];
  const f = (v) => v.toFixed(1);
  console.log(`\n${res.model}: ${res.rooms} rooms, gross wall ${f(res.gross)} m2; ${res.pairs} room-opening pairs (${res.ambiguous} skipped: their room label is not unique); past the ceiling ${JSON.stringify(res.above)}, below the floor ${JSON.stringify(res.below)}, wholly outside ${res.wholly}`);
  console.log(`  openings off ${f(res.off)} m2 after the cut (${f(res.off + res.cut)} before); cut ${f(res.cut)} m2 on ${res.cutN} deductions; net wall ${f(res.net)} m2`);
  for (const t of res.top) console.log(`    #${t.id} ${t.cls} ${t.name ?? ""} in ${t.room}: room ${t.roomHeight} m, opening ${t.openingHeight} m, past ceiling ${t.aboveCeiling} m, below floor ${t.belowFloor} m`);
}
console.log(`\nAll: ${T.rooms} rooms, gross ${T.gross.toFixed(0)} m2, openings off ${T.off.toFixed(0)} m2 after the cut (${(T.off + T.cut).toFixed(0)} before), ${T.cut.toFixed(1)} m2 cut on ${T.cutN} deductions, net ${T.net.toFixed(0)} m2`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ total: T, models: out }, null, 1));
