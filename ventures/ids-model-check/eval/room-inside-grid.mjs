// Does each room's inside test agree with the room's own volume?
//
//   node eval/room-inside-grid.mjs MODEL.ifc ... [--n 12] [--off 0.15]
//
// A grid of n x n x n points through each room's box is tested with
// pointInSolid (ifc-quantity-takeoff/rooms.mjs). The share inside should
// match the room's volume over its box volume; a room off by more than
// --off is listed. Needs no outside truth. Rooms drawn as faceted meshes are
// skipped (their test is a winding number, not convex pieces).
// 2026-11-23: 29 of 852 rooms off before the flat-piece fix, 0 after
// (eval/cobie-flat-pieces-2026-11-23.md).
import { readFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { pointInSolid } from "../../ifc-quantity-takeoff/rooms.mjs";
import { invert, apply } from "../../ifc-quantity-takeoff/geom.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const N = opt("--n", 12), OFF = opt("--off", 0.15);
const files = args.filter((a, i) => !a.startsWith("--") && !["--n", "--off"].includes(args[i - 1]));
let rooms = 0, off = 0;
for (const f of files) {
  const name = f.split("/").pop();
  let tk;
  try { tk = takeoff(parseStep(readFileSync(f).toString("utf8"))); } catch (e) { console.log(`${name}: ERROR ${e.message}`); continue; }
  for (const r of tk.rooms) {
    if (!r.solid || !r.box || r.solid.mesh) continue;
    const B = r.box, bv = (B[3] - B[0]) * (B[4] - B[1]) * (B[5] - B[2]), vol = r.computed?.volume;
    if (!vol || !bv) continue;
    const inv = invert(r.world), u = r.lengthUnit;
    let n = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const p = [B[0] + (B[3] - B[0]) * (i + 0.5) / N, B[1] + (B[4] - B[1]) * (j + 0.5) / N, B[2] + (B[5] - B[2]) * (k + 0.5) / N];
      if (pointInSolid(r.solid, apply(inv, p.map((v) => v / u)))) n++;
    }
    rooms++;
    const want = vol / bv, got = n / N ** 3;
    if (Math.abs(got - want) > OFF) { off++; console.log(`${name}: ${r.label}: volume share ${want.toFixed(2)}, inside test ${got.toFixed(2)}`); }
  }
}
console.log(`${rooms} rooms, ${off} off by more than ${OFF}`);
