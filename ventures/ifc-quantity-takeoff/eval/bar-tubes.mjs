// Swept-disk bars in the model view, over real exports.
//
//   node eval/bar-tubes.mjs file.ifc [...]
//
// Per file: reinforcing bars and other elements whose body is a swept disk,
// how many the view now draws as tubes (view-mesh.mjs tubeTriangles) rather
// than leaving out, how many triangles that costs, and the tube's enclosed
// volume against the computed pi r^2 L (a closed, outward tube of 12 sides
// encloses 95.5% of the round bar on straight runs, a little less on chorded
// bends; models with many bars get fewer sides, tubeDetail). The quantities themselves are not changed by drawing.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { rowMesh, meshVolume, modelOrigin, tubeDetail, MAX_ELEMENT_TRIANGLES } from "../view-mesh.mjs";

const all = { files: 0, rows: 0, drawn: 0, boxed: 0, tris: 0, ratios: [] };
for (const p of process.argv.slice(2)) {
  const res = takeoff(parseStep(readFileSync(p)), { rooms: false });
  const origin = modelOrigin(res.rows);
  const tube = tubeDetail(res.rows.filter((r) => !r.isAssembly));
  const polygon = (tube.sides / (2 * Math.PI)) * Math.sin((2 * Math.PI) / tube.sides);
  const rows = res.rows.filter((r) => !r.isAssembly && r.computed?.solids?.body?.bars?.some((b) => b.tube));
  let drawn = 0, boxed = 0, tris = 0, ms = 0;
  const ratios = [];
  for (const r of rows) {
    if (r.box) boxed++;
    const t0 = performance.now();
    const m = rowMesh(r, origin, MAX_ELEMENT_TRIANGLES, tube);
    ms += performance.now() - t0;
    if (!m || m.boxOnly) continue;
    drawn++;
    tris += m.positions.length / 9;
    const v = r.computed.net ?? r.computed.gross ?? null;
    if (v > 0) ratios.push(meshVolume(m.positions) / v);
  }
  ratios.sort((a, b) => a - b);
  const q = (k) => (ratios.length ? ratios[Math.min(ratios.length - 1, Math.floor(k * ratios.length))].toFixed(4) : "-");
  console.log(`${basename(p)}: ${rows.length} swept-disk elements; ${tube.sides} sides${tube.overBudget ? " (over budget)" : ""}, polygon/circle ${polygon.toFixed(4)}; box ${boxed}; drawn as tubes ${drawn}; ${tris} triangles (${rows.length ? (tris / rows.length).toFixed(0) : 0} each) in ${ms.toFixed(0)} ms; tube/computed min ${q(0)} median ${q(0.5)} max ${q(1)}`);
  all.files++; all.rows += rows.length; all.drawn += drawn; all.boxed += boxed; all.tris += tris; all.ratios.push(...ratios);
}
all.ratios.sort((a, b) => a - b);
console.log(`all: ${all.files} files, ${all.rows} swept-disk elements, box ${all.boxed}, drawn ${all.drawn}, ${all.tris} triangles; volume ratio min ${all.ratios[0]?.toFixed(4)} max ${all.ratios.at(-1)?.toFixed(4)}`);
