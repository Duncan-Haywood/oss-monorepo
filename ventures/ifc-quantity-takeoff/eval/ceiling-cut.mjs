// Doors and windows cut at a room's height in the net wall finish: for each
// model, how many openings reach past the room they come off in (a window
// over a lowered ceiling, a roof light over the room below), how much area
// the cut leaves on the wall, and the openings it touches, to look at.
//
//   node eval/ceiling-cut.mjs <model.ifc>... [--json out.json] [--list N]
//
// The figure before the cut is openingArea + clippedArea (deductOpenings
// records what it leaves), so one takeoff per model gives both.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { heightShare } from "../rooms.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const li = args.indexOf("--list");
const listN = li >= 0 ? +args.splice(li, 2)[1] : 12;
const out = [];
const T = { rooms: 0, gross: 0, before: 0, after: 0, clipped: 0, outside: 0, roomsTouched: 0 };
for (const file of args) {
  const r = takeoff(parseStep(readFileSync(file)));
  const res = { model: basename(file), rooms: 0, gross: 0, before: 0, after: 0, clipped: 0, outside: 0, roomsTouched: 0, netBefore: 0, netAfter: 0, list: [] };
  const byLabel = new Map(r.rooms.map((x) => [x.label, x]));
  for (const rm of r.rooms) {
    const c = rm.computed;
    if (!c || c.wallArea == null) continue;
    res.rooms++; res.gross += c.wallArea;
    res.after += c.openingArea; res.before += c.openingArea + c.clippedArea;
    res.netAfter += c.netWallArea; res.netBefore += Math.max(0, c.wallArea - c.openingArea - c.clippedArea - c.glazedArea);
    res.clipped += c.clipped; res.outside += c.outside;
    if (c.clipped || c.outside) res.roomsTouched++;
  }
  for (const x of r.rows) {
    if (!/^IFC(DOOR|WINDOW)/.test(x.ifcType) || x.isAssembly || !x.box) continue;
    for (const label of x.facesRooms || []) {
      const rm = byLabel.get(label);
      const k = heightShare(x.box, rm?.box);
      if (k >= 1 || !rm?.box) continue;
      res.list.push({ id: x.id, cls: x.ifcType, name: x.name, room: label, share: +k.toFixed(3), opening: [+x.box[2].toFixed(3), +x.box[5].toFixed(3)], roomZ: [+rm.box[2].toFixed(3), +rm.box[5].toFixed(3)], storedHeight: rm.stored?.Height?.value ?? null, check: Object.values(rm.check || {}).filter((q) => !q.agree).map((q) => `${q.name} ${q.reason}`) });
    }
  }
  out.push(res);
  for (const k of Object.keys(T)) T[k] += res[k];
  const f = (v) => v.toFixed(1);
  console.log(`\n${res.model}: ${res.rooms} rooms, gross wall ${f(res.gross)} m2; doors and windows off ${f(res.before)} -> ${f(res.after)} m2; cut at the room's height ${res.clipped}, wholly outside it ${res.outside} (${res.roomsTouched} rooms); net wall ${f(res.netBefore)} -> ${f(res.netAfter)} m2`);
  for (const m of res.list.slice(0, listN)) console.log(`  #${m.id} ${m.cls} ${m.name ?? ""} in ${m.room}: ${(100 * m.share).toFixed(0)}% inside; opening z ${m.opening.join("..")}, room z ${m.roomZ.join("..")}${m.check.length ? "; room check: " + m.check.join(", ") : ""}`);
  if (res.list.length > listN) console.log(`  ... ${res.list.length - listN} more`);
}
console.log(`\nAll: ${T.rooms} rooms, gross wall ${T.gross.toFixed(0)} m2; doors and windows off ${T.before.toFixed(1)} -> ${T.after.toFixed(1)} m2 (${(T.before - T.after).toFixed(1)} m2 left on the wall); ${T.clipped} openings cut, ${T.outside} wholly outside their room; ${T.roomsTouched} rooms touched`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ total: T, models: out }, null, 1));
