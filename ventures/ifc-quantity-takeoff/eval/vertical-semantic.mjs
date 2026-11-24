// A gradient curve's elevations (alignment.mjs, as the takeoff reads them)
// against the file's own semantic vertical alignment.
//
//   node eval/vertical-semantic.mjs model.ifc [more.ifc ...]
//
// Each IfcAlignmentVerticalSegment (StartDistAlong, HorizontalLength,
// StartHeight, StartGradient, EndGradient, RadiusOfCurvature, type) gives the
// elevation at a horizontal distance by the textbook formulas, independent of
// the geometric IfcCurveSegments: CONSTANTGRADIENT z0 + g0 dx; PARABOLICARC
// z0 + g0 dx + (g1 - g0) dx^2 / (2 L); CIRCULARARC with R = |radius|, sag
// when g1 > g0: sin t = sin t0 +- dx / R, z = z0 +- R (cos t0 - cos t). The
// geometric curve is sampled every metre (and at each segment's ends) and the
// worst difference per segment printed. A vertical alignment is paired with
// the gradient curve whose first vertical placement has its start height.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { Geometry } from "../geom.mjs";
import { AlignmentReader } from "../alignment.mjs";

const semanticZ = (s, x) => {
  const dx = x - s.x0;
  if (s.type === "CONSTANTGRADIENT") return s.z0 + s.g0 * dx;
  if (s.type === "PARABOLICARC") return s.z0 + s.g0 * dx + ((s.g1 - s.g0) * dx * dx) / (2 * s.L);
  if (s.type === "CIRCULARARC") {
    const R = Math.abs(s.R), sg = s.g1 > s.g0 ? 1 : -1;
    const t0 = Math.atan(s.g0);
    const sinT = Math.sin(t0) + (sg * dx) / R;
    return s.z0 + sg * R * (Math.cos(t0) - Math.sqrt(1 - sinT * sinT));
  }
  return null;
};

for (const file of process.argv.slice(2)) {
  const model = parseStep(readFileSync(file));
  const geo = new Geometry(model);
  const A = new AlignmentReader(geo);
  const ents = [...model.entities.values()];
  console.log(`== ${basename(file)}`);
  const verticals = ents.filter((e) => e.type === "IFCALIGNMENTVERTICAL");
  const gradients = ents.filter((e) => e.type === "IFCGRADIENTCURVE");
  for (const v of verticals) {
    const refId = (r) => (r && typeof r === "object" ? r.ref : r);
    const nest = ents.find((e) => e.type === "IFCRELNESTS" && refId(e.args[4]) === v.id);
    if (!nest) continue;
    const segs = (nest.args[5] || []).map((r) => geo.get(geo.get(r)?.args[7])).filter((d) => d?.type === "IFCALIGNMENTVERTICALSEGMENT").map((d) => ({
      x0: geo.num(d.args[2]), L: geo.num(d.args[3]), z0: geo.num(d.args[4]), g0: geo.num(d.args[5]), g1: geo.num(d.args[6]), R: geo.num(d.args[7]), type: d.args[8]?.enum,
    })).filter((s) => s.L > 0);
    if (!segs.length) continue;
    const gc = gradients.find((g) => {
      const first = geo.get((g.args[0] || [])[0]);
      const o = first ? A.place2(first.args[1]).o : null;
      return o && Math.abs(o[1] - segs[0].z0) < 1e-6 && Math.abs(o[0] - segs[0].x0) < 1e-6;
    });
    if (!gc) { console.log(`  vertical #${v.id}: no gradient curve starts where it does`); continue; }
    let B;
    try { B = A.basis(gc.id); } catch (err) { console.log(`  vertical #${v.id} / gradient #${gc.id}: not read (${err.message})`); continue; }
    let worstAll = 0;
    const lines = [];
    for (const s of segs) {
      let worst = 0, at = s.x0;
      const n = Math.max(2, Math.ceil(s.L));
      for (let i = 0; i <= n; i++) {
        const x = s.x0 + (s.L * i) / n;
        const zs = semanticZ(s, x);
        if (zs == null) continue;
        const d = B.frame(x).p[2] - zs;
        if (Math.abs(d) > Math.abs(worst)) { worst = d; at = x; }
      }
      worstAll = Math.max(worstAll, Math.abs(worst));
      lines.push(`    ${s.type} ${s.x0.toFixed(3)} + ${s.L.toFixed(3)} m: worst ${worst.toExponential(2)} m at ${at.toFixed(1)}`);
    }
    console.log(`  vertical #${v.id} / gradient #${gc.id}: ${segs.length} segments, worst elevation difference ${worstAll.toExponential(2)} m`);
    console.log(lines.join("\n"));
  }
}
