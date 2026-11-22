// Walls the engine reads as built on an arc (reason "curved"), against the
// face areas a quarter-circle wall would have from its stored Length (the
// centre line), Width and Height.
//
//   node eval/curved-walls.mjs model.ifc
//
// Prints a markdown table: plane cut, centre x height, outer arc x height and
// the stored GrossSideArea (eval/curved-and-faces-2026-11-22.md).

import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const res = takeoff(parseStep(readFileSync(process.argv[2])));
const val = (r, k) => r.stored[k]?.value;
console.log("| Element | Length m | Width m | Height m | plane cut m2 | centre x H | outer arc x H | stored | outer/stored |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of res.rows) {
  const c = r.areaCheck?.GrossSideArea;
  if (c?.reason !== "curved") continue;
  const L = val(r, "Length"), W = val(r, "Width"), H = val(r, "Height");
  if (!(L > 0 && W > 0 && H > 0)) { console.log(`| #${r.id} | no stored Length, Width and Height |`); continue; }
  const outer = (L + (W / 2) * (Math.PI / 2)) * H;
  console.log(`| #${r.id} | ${L.toFixed(4)} | ${W} | ${+H.toFixed(4)} | ${c.computed.toFixed(4)} | ${(L * H).toFixed(4)} | ${outer.toFixed(4)} | ${c.stored.toFixed(4)} | ${((outer / c.stored - 1) * 100).toFixed(3)}% |`);
}
