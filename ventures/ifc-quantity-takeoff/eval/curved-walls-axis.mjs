// Curved walls measured on their facets (curvedFaces, geom.mjs) against the
// arc each one's own Axis representation draws (an IfcTrimmedCurve on an
// IfcCircle): the axis radius against the mean of the measured face radii,
// and each face against (radius +- width/2) x the arc's angle x the wall's
// height, which is exact only for a wall of one height.
//
//   node eval/curved-walls-axis.mjs model.ifc id [id ...]
//
// eval/triangulated-arc-breps-2026-11-23.md

import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { takeoff, readUnits } from "../qto.mjs";

const [file, ...ids] = process.argv.slice(2);
const model = parseStep(readFileSync(file));
const E = model.entities;
const f = readUnits(model).LENGTHUNIT;
const ref = (x) => x?.ref;
const byId = new Map(takeoff(model).rows.map((r) => [r.id, r]));
const n = (x, d = 4) => (x == null ? "-" : x.toFixed(d));
console.log("| Wall | type | axis radius m | arc deg | height m | measured mid radius m | width m | outer: measured / arc x H m2 | inner: measured / arc x H m2 | how it passed |");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
for (const id of ids.map(Number)) {
  const e = E.get(id), r = byId.get(id), S = r?.computed?.areas?.side;
  if (!S?.chord) { console.log(`| #${id} | ${r?.type ?? "-"} | not measured |`); continue; }
  let R = null, arc = null;
  for (const x of E.get(ref(e.args[6])).args[2]) {
    const rep = E.get(ref(x));
    if (rep.args[1] !== "Axis") continue;
    const tc = E.get(ref(rep.args[3][0]));
    if (tc?.type !== "IFCTRIMMEDCURVE") continue;
    const c = E.get(ref(tc.args[0]));
    if (c?.type !== "IFCCIRCLE") continue;
    R = c.args[1] * f;
    const a = tc.args[1][0].value, b = tc.args[2][0].value;
    arc = (((tc.args[3] ? b - a : a - b) % 360) + 360) % 360 || 360;
  }
  const H = r.box ? r.box[5] - r.box[2] : null;
  const mid = (S.radius.outer + S.radius.inner) / 2, th = arc == null ? null : (arc * Math.PI) / 180;
  const o = th == null ? null : (mid + S.width / 2) * th * H, i = th == null ? null : (mid - S.width / 2) * th * H;
  console.log(`| #${id} | ${r.type} | ${n(R)} | ${n(arc, 3)} | ${n(H, 3)} | ${n(mid)} | ${n(S.width)} | ${n(S.faces.gross[0], 3)} / ${n(o, 3)} | ${n(S.faces.gross[1], 3)} / ${n(i, 3)} | ${S.stepped ? "swept volume" : "one section"} |`);
}
