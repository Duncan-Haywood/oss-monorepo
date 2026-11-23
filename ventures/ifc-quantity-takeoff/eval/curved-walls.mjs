// Walls the engine reads as built on an arc, with the faces measured on their
// facets (curvedFaces, geom.mjs) against the face areas a quarter-circle wall
// would have from its stored Length (the centre line), Width and Height, and
// the stored GrossSideArea.
//
//   node eval/curved-walls.mjs model.ifc [more.ifc ...]
//
// Prints a markdown table per file (eval/curved-side-area-2026-11-23.md; the
// first version, before the faces were measured: eval/curved-and-faces-2026-11-22.md).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const n4 = (x) => (x == null ? "-" : x.toFixed(4));
for (const file of process.argv.slice(2)) {
  const res = takeoff(parseStep(readFileSync(file)));
  const val = (r, k) => r.stored[k]?.value;
  console.log(`\n${basename(file)}\n`);
  console.log("| Element | stored L x W x H m | chord cut m2 | outer face m2 | inner face m2 | mean m2 | width m | radius out/in m | (L + W/2 x pi/2) x H | stored m2 | outer/stored | reason |");
  console.log("|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---|");
  for (const r of res.rows) {
    const S = r.computed?.areas?.side;
    if (!S?.curved) continue;
    const c = r.areaCheck?.GrossSideArea;
    const L = val(r, "Length"), W = val(r, "Width"), H = val(r, "Height");
    const dims = L > 0 && W > 0 && H > 0 ? `${L.toFixed(4)} x ${W} x ${+H.toFixed(4)}` : "-";
    const quarter = L > 0 && W > 0 && H > 0 ? (L + (W / 2) * (Math.PI / 2)) * H : null;
    // faces only when measured on the facets (a body that fails the volume
    // check keeps the plane cuts, which say nothing about a curved face)
    const outer = S.chord ? S.faces.gross[0] : null;
    const ratio = c && outer != null ? `${((outer / c.stored - 1) * 100).toFixed(3)}%` : "-";
    const radius = S.radius ? `${S.radius.outer.toFixed(4)} / ${S.radius.inner.toFixed(4)}` : "-";
    const reason = !c ? "nothing stored" : c.agree ? "agrees" : c.reason ?? "-";
    console.log(`| #${r.id} | ${dims} | ${n4(S.chord?.gross ?? S.gross)} | ${n4(outer)} | ${n4(S.chord ? S.faces.gross[1] : null)} | ${n4(S.chord ? S.gross : null)} | ${n4(S.chord ? S.width : null)} | ${radius} | ${n4(quarter)} | ${n4(c?.stored)} | ${ratio} | ${reason} |`);
  }
}
