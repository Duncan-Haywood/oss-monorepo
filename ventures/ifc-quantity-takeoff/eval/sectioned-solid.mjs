// IfcSectionedSolidHorizontal volumes (alignment.mjs, lofted and meshed) against
// an integral that meshes nothing.
//
//   node eval/sectioned-solid.mjs model.ifc [--boxes ios.json]
//
// Reference: for each pair of stations, V = integral of A(t) (1 - k(s) e(t)) ds
// over the horizontal distance s, where A(t) and its centroid's level offset
// e(t) (lateral offset + profile centroid x, left positive) come from the two
// cross-sections interpolated point by point (the loft's own rule), k is the
// directrix's horizontal curvature (from its tangent, central differences)
// and the integral is Gauss-Legendre, 64 points per station pair (Pappus's
// theorem, slice by slice), with a gradient curve's level ds stretched by
// the grade (sqrt(1 + g^2)): the cross-sections stand square to the tangent.
// --boxes takes IfcOpenShell world boxes ({id: [volume, minx, miny, minz,
// maxx, maxy, maxz]}, eval/sectioned-solid-ifcopenshell.py) and compares the
// box corners: placement and the cross-section's axes, not the volume
// (IfcOpenShell 0.8's lofts here are open shells, so its volumes are not one).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { Geometry } from "../geom.mjs";
import { AlignmentReader, SIGN_X } from "../alignment.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const bAt = args.indexOf("--boxes");
const boxes = bAt >= 0 ? JSON.parse(readFileSync(args[bAt + 1], "utf8")) : null;
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--boxes");
const model = parseStep(readFileSync(file));
const E = model.entities;
const geo = new Geometry(model);
const A = new AlignmentReader(geo);

const G = [];
{ // 8-point Gauss-Legendre nodes on [-1, 1]
  const x = [0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
  const w = [0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  for (let i = 0; i < 4; i++) G.push([x[i], w[i]], [-x[i], w[i]]);
}
const areaCx = (loops) => {
  let a = 0, mx = 0;
  for (const l of loops) {
    let la = 0, lx = 0;
    const p = l.pts;
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
      const c = x0 * y1 - x1 * y0;
      la += c; lx += (x0 + x1) * c;
    }
    a += l.s * Math.abs(la / 2);
    mx += l.s * Math.sign(la) * (lx / 6);
  }
  return { a, cx: a ? mx / a : 0 };
};

function reference(e) {
  const [dirRef, secs, poss] = e.args;
  const B = A.basis(dirRef.ref);
  const loops = secs.map((r) => geo.profile(r));
  const st = poss.map((r) => { const pe = geo.get(geo.get(r).args[0]); return { d: geo.num(pe.args[0]) ?? 0, lat: geo.num(pe.args[1]) ?? 0 }; });
  const heading = (s) => { const t = B.frame(s).t; return Math.atan2(t[1], t[0]); };
  const kappa = (s) => { const h = 0.01; let d = heading(s + h) - heading(s - h); d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return d / (2 * h); };
  let V = 0;
  for (let i = 0; i + 1 < st.length; i++) {
    const d0 = st[i].d, d1 = st[i + 1].d, pieces = 8;
    for (let p = 0; p < pieces; p++) {
      const a = d0 + ((d1 - d0) * p) / pieces, b = d0 + ((d1 - d0) * (p + 1)) / pieces;
      for (const [x, w] of G) {
        const s = (a + b) / 2 + ((b - a) / 2) * x, t = (s - d0) / (d1 - d0);
        const L = loops[i].map((l, k) => ({ s: l.s, pts: l.pts.map((q, j) => { const r = loops[i + 1][k].pts[j]; return [q[0] + t * (r[0] - q[0]), q[1] + t * (r[1] - q[1])]; }) }));
        const { a: ar, cx } = areaCx(L);
        const ecc = st[i].lat + t * (st[i + 1].lat - st[i].lat) + SIGN_X * cx;
        const g = B.frame(s).g ?? 0;
        // a gradient curve's stations are level distances; a polyline's are 3D already
        const stretch = B.kind === "gradient" ? Math.hypot(1, g) : 1;
        V += ((b - a) / 2) * w * stretch * ar * (1 - kappa(s) * ecc);
      }
    }
  }
  return V;
}

const res = takeoff(model);
const rel = [], box = [], by = {};
for (const r of res.rows) {
  const e = E.get(r.id);
  const rep = e && geo.get(e.args[6]);
  const items = (rep?.args[2] || []).flatMap((sr) => geo.get(sr).args[3] || []).map((ir) => geo.get(ir)).filter((it) => it.type === "IFCSECTIONEDSOLIDHORIZONTAL");
  if (!items.length) continue;
  const ref = items.reduce((v, it) => v + reference(it), 0);
  const v = r.computed?.gross ?? null;
  if (v == null) { console.log(`#${r.id} not read: ${r.computed?.reason}`); continue; }
  const d = (v - ref) / ref;
  rel.push([Math.abs(d), d, r.id, r.ifcClass, v, ref]);
  (by[r.ifcClass] ??= [0, 0, 0]); by[r.ifcClass][0]++; by[r.ifcClass][1] += v; by[r.ifcClass][2] += ref;
  const o = boxes?.[r.id];
  if (o && typeof o !== "string" && r.box) box.push([Math.max(...r.box.map((b, i) => Math.abs(b - o[1 + i]))), r.id]);
}
rel.sort((a, b) => b[0] - a[0]);
box.sort((a, b) => b[0] - a[0]);
const pct = (q, arr) => arr[Math.min(arr.length - 1, Math.floor((1 - q) * arr.length))][0];
console.log(`${basename(file)}: ${rel.length} elements with an IfcSectionedSolidHorizontal body`);
console.log(`  volume vs the integral: |diff| median ${pct(0.5, rel).toExponential(2)}, p95 ${pct(0.95, rel).toExponential(2)}, max ${rel[0][0].toExponential(2)}; within 0.1%: ${rel.filter((x) => x[0] < 1e-3).length}, within 0.01%: ${rel.filter((x) => x[0] < 1e-4).length}`);
console.log(`  largest: ${rel.slice(0, 5).map((x) => `#${x[2]} ${x[3]} ${x[4].toFixed(4)} vs ${x[5].toFixed(4)} m3 (${(x[1] * 100).toFixed(4)}%)`).join("; ")}`);
for (const [k, [n, a, b]] of Object.entries(by)) console.log(`  ${k}: ${n}, ${a.toFixed(3)} m3 here vs ${b.toFixed(3)} m3 integral (${((a / b - 1) * 100).toFixed(4)}%)`);
if (box.length) console.log(`  world box corners vs IfcOpenShell: median ${pct(0.5, box).toExponential(2)} m, p95 ${pct(0.95, box).toExponential(2)} m, max ${box[0][0].toExponential(2)} m (#${box[0][1]}); n=${box.length}`);
