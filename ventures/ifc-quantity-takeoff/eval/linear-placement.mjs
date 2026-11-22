// IfcLinearPlacement and alignment curves (alignment.mjs) checked on a model's own data.
//
//   node eval/linear-placement.mjs model.ifc [more.ifc ...] [--points out.json]
//
// 1. Continuity: every IfcCurveSegment's end, as alignment.mjs draws it,
//    against the next segment's Placement (the exporter's own figure for the
//    same point and direction), on every horizontal and vertical curve.
// 2. A gradient curve's EndPoint against the end of its vertical.
// 3. Every IfcLinearPlacement placed: how many, and how many fall back or fail.
// --points writes every linear placement's world origin (for a comparison
// with another reader: eval/linear-placement-vs-ifcopenshell.py).

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { Geometry, apply } from "../geom.mjs";
import { AlignmentReader } from "../alignment.mjs";

const args = process.argv.slice(2);
const ptsAt = args.indexOf("--points");
const ptsOut = ptsAt >= 0 ? args[ptsAt + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--points");
const points = {};

for (const file of files) {
  const model = parseStep(readFileSync(file));
  const geo = new Geometry(model);
  const A = new AlignmentReader(geo);
  const name = basename(file);
  console.log(`== ${name} (${model.schema})`);
  let worstGap = 0, worstTurn = 0, joints = 0;
  for (const e of model.entities.values()) {
    if (e.type !== "IFCCOMPOSITECURVE" && e.type !== "IFCGRADIENTCURVE") continue;
    const refs = e.args[0] || [];
    if (!refs.every((r) => geo.get(r)?.type === "IFCCURVESEGMENT")) continue;
    let curveGap = 0, curveTurn = 0, len = 0;
    for (let i = 0; i + 1 < refs.length; i++) {
      const s = A.segment(refs[i]);
      len += s.length;
      const end = s.at(s.length);
      const next = A.place2(geo.get(refs[i + 1]).args[1]);
      const gap = Math.hypot(end.p[0] - next.o[0], end.p[1] - next.o[1]);
      const turn = Math.abs(Math.atan2(end.t[0] * next.x[1] - end.t[1] * next.x[0], end.t[0] * next.x[0] + end.t[1] * next.x[1]));
      const disc = geo.get(refs[i]).args[0]?.enum === "DISCONTINUOUS";
      if (!disc) { curveGap = Math.max(curveGap, gap); curveTurn = Math.max(curveTurn, turn); joints++; }
    }
    worstGap = Math.max(worstGap, curveGap);
    worstTurn = Math.max(worstTurn, curveTurn);
    const kinds = refs.map((r) => geo.get(geo.get(r).args[4]).type.replace("IFC", "").toLowerCase());
    const tally = Object.entries(kinds.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {})).map(([k, n]) => `${n} ${k}`).join(", ");
    let endNote = "";
    if (e.type === "IFCGRADIENTCURVE" && e.args[3]) {
      const V = A.composite(e.id);
      const vend = V.at(V.segments.at(-1).start + V.segments.at(-1).length);
      const ep = A.place2(e.args[3]).o;
      endNote = `; vertical end vs EndPoint ${Math.hypot(vend.p[0] - ep[0], vend.p[1] - ep[1]).toExponential(2)} m`;
    }
    console.log(`  #${e.id} ${e.type === "IFCGRADIENTCURVE" ? "vertical" : "horizontal"} (${tally}; ${len.toFixed(3)} m to the last joint): worst joint gap ${curveGap.toExponential(2)} m, turn ${(curveTurn * 180 / Math.PI).toExponential(2)} deg${endNote}`);
  }
  console.log(`  all ${joints} continuous joints: worst gap ${worstGap.toExponential(2)} m, worst turn ${(worstTurn * 180 / Math.PI).toExponential(2)} deg`);

  let placed = 0, failed = 0;
  const reasons = {};
  const out = [];
  for (const e of model.entities.values()) {
    if (e.type !== "IFCLINEARPLACEMENT") continue;
    try {
      const m = geo.objectPlacement(e.id);
      placed++;
      out.push([e.id, ...apply(m, [0, 0, 0]), m[0], m[4], m[8]]);
    } catch (err) { failed++; reasons[err.message] = (reasons[err.message] || 0) + 1; }
  }
  console.log(`  IfcLinearPlacement: ${placed} placed, ${failed} not${failed ? " (" + Object.entries(reasons).map(([k, n]) => `${n} ${k}`).join("; ") + ")" : ""}`);
  points[name] = out;
}
if (ptsOut) writeFileSync(ptsOut, JSON.stringify(points));
