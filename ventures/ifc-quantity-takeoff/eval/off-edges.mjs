// kleine_Wohnung #207997's volume three ways, independent of geom.mjs's mesher:
//
//   node eval/off-edges.mjs ISSUE_159_kleine_Wohnung_R22.ifc
//
// The brep is a cone frustum cut in two halves by a vertical plane, each half
// a ruled IfcRationalBSplineSurfaceWithKnots (cubic in u, linear in v, every
// weight 1) between a circle of 0.035 m at z 0.13 and one of 0.015 m at
// z 0.33; the caps are planes bounded by exact circles. Ruled faces between
// two horizontal curves make every horizontal section the same blend
// (1 - t) C0(u) + t C1(u) of the two cap curves, so its area is quadratic in
// t and Simpson's rule on t = 0, 1/2, 1 integrates the volume exactly. Each
// section's area is the shoelace sum over 40,000 points round the two
// B-spline curves, de Boor written out here. Prints that volume, the circular
// frustum's pi h (R^2 + R r + r^2) / 3, how far the B-spline curves stand
// inside their circles, and this tool's and IfcOpenShell's figures.

import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { Geometry, solidVolume } from "../geom.mjs";

const file = process.argv[2];
const m = parseStep(readFileSync(file));
const E = m.entities;
const pt = (r) => E.get(r.ref).args[0];
const shell = E.get(E.get(207997).args[0].ref).args[0].map((f) => E.get(f.ref));
const splines = shell.map((f) => E.get(f.args[1].ref)).filter((s) => s.type === "IFCRATIONALBSPLINESURFACEWITHKNOTS");
if (splines.length !== 2) throw new Error("expected two B-spline faces");

function basisFns(knots, p, u) {
  // Cox-de Boor over the expanded knot vector, the last span closed at u = 1
  const n = knots.length - p - 1;
  let N = Array.from({ length: knots.length - 1 }, (_, i) => (u >= knots[i] && u < knots[i + 1]) || (u === knots.at(-1) && knots[i] < u && knots[i + 1] === u) ? 1 : 0);
  for (let d = 1; d <= p; d++) {
    const M = [];
    for (let i = 0; i < knots.length - 1 - d; i++) {
      const a = knots[i + d] - knots[i], b = knots[i + d + 1] - knots[i + 1];
      M.push((a ? (u - knots[i]) / a * N[i] : 0) + (b ? (knots[i + d + 1] - u) / b * N[i + 1] : 0));
    }
    N = M;
  }
  return N.slice(0, n);
}
const curves = splines.map((s) => {
  const [pu, , rows, , , , , um, , uk] = s.args;
  const knots = um.flatMap((k, i) => Array(k).fill(uk[i]));
  const w = s.args.at(-1);
  if (w.flat().some((x) => x !== 1)) throw new Error("weights other than 1: this check assumes a polynomial spline");
  // rows[i] = [point at v 0, point at v 1]: two cap curves
  return [0, 1].map((j) => ({ P: rows.map((r) => pt(r[j])), knots, p: pu }));
});
const ev = (c, u) => { const N = basisFns(c.knots, c.p, u); return [0, 1, 2].map((k) => N.reduce((s, x, i) => s + x * c.P[i][k], 0)); };

function sectionArea(t) {
  const pts = [];
  const n = 20000;
  for (const [c0, c1] of curves) for (let k = 0; k < n; k++) {
    const a = ev(c0, k / n), b = ev(c1, k / n);
    pts.push([(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]]);
  }
  let s = 0;
  for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; s += a[0] * b[1] - a[1] * b[0]; }
  return Math.abs(s) / 2;
}
const z = curves[0].map((c) => c.P[0][2]);
const h = Math.abs(z[1] - z[0]);
const A = [0, 0.5, 1].map(sectionArea);
const vSpline = (h / 6) * (A[0] + 4 * A[1] + A[2]);

// the circles: centre and radius of each cap from the curve's ends
const caps = curves[0].map((c, j) => {
  const a = c.P[0], b = c.P.at(-1);
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, j };
});
let worst = 0;
for (const pair of curves) for (const [j, c] of pair.entries()) for (let k = 0; k <= 4000; k++) {
  const p = ev(c, k / 4000);
  worst = Math.max(worst, caps[j].r - Math.hypot(p[0] - caps[j].c[0], p[1] - caps[j].c[1]));
}
const [R, r] = caps.map((c) => c.r).sort((x, y) => y - x);
const vCircle = (Math.PI * h * (R * R + R * r + r * r)) / 3;
const here = Math.abs(solidVolume(new Geometry(m).item(207997)));
const ref = JSON.parse(readFileSync(new URL("./kleine_Wohnung-breps-ifcopenshell-2026-11-23.json", import.meta.url), "utf8"))[207997];
const ios = Math.abs(typeof ref === "object" ? ref.volume : ref);
const pct = (x) => `${((100 * (x - vSpline)) / vSpline).toFixed(4)}%`;
console.log(`#207997: caps r ${R} and ${r} m, ${h.toFixed(4)} m apart`);
console.log(`  section areas at t 0, 1/2, 1: ${A.map((a) => a.toPrecision(8)).join(", ")} (circles ${[caps[0].r, (caps[0].r + caps[1].r) / 2, caps[1].r].map((x) => (Math.PI * x * x).toPrecision(8)).join(", ")})`);
console.log(`  B-spline curves stand up to ${(worst * 1000).toFixed(4)} mm inside their circles`);
console.log(`  volume of the B-spline faces (exact):  ${vSpline.toPrecision(7)}`);
console.log(`  this tool:                             ${here.toPrecision(7)}  ${pct(here)}`);
console.log(`  circular frustum the edges describe:   ${vCircle.toPrecision(7)}  ${pct(vCircle)}`);
console.log(`  IfcOpenShell 0.9.0 (committed JSON):   ${ios.toPrecision(7)}  ${pct(ios)}`);
