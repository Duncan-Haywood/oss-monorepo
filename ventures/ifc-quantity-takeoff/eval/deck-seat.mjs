// A lofted deck's underside against the tops of the girders under it.
//
//   node eval/deck-seat.mjs model.ifc DECK_SOLID GIRDER_SOLID...
//
// The ids are IfcSectionedSolidHorizontal items: the deck's (on its gradient
// curve) and each girder's (on its own 3D polyline). For each girder, the
// station of its middle on the deck's alignment; there, the girder's highest
// vertex and the deck's lowest vertex above the girder's width, among the
// loft slices within 0.3 m of the girder's nearest slice. A deck drawn where
// it belongs sits a haunch (a few centimetres) over its girders; PGSuper
// 8.0.3's decks read as written sat 25 m over them
// (eval/pgsuper-bridges-2026-11-24.md). A deck slice spacing over 0.6 m (a
// deck on a straight run, sliced every 1/64 of it) gives NaN there.
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url).href;
const { parseStep } = await import(root + "step.mjs");
const { Geometry } = await import(root + "geom.mjs");
const [file, deckId, ...beamIds] = process.argv.slice(2);
const model = parseStep(readFileSync(file));
const geo = new Geometry(model);
const verts = (id) => { const s = geo.item(Number(id)); const out = []; for (const sh of s.shells) for (const f of sh.loops) out.push(...f); return { s, out }; };
const deck = verts(deckId);
const e = geo.get(Number(deckId));
const pos = e.args[2].map((r) => geo.get(r));
const pe = (p) => geo.get(p.args[0]);
const d0 = geo.num(pe(pos[0]).args[0]), d1 = geo.num(pe(pos.at(-1)).args[0]);
const B = geo.alignments.basis(e.args[0].ref ?? e.args[0]);
const along = (d, p) => { const f = B.frame(d); return (p[0] - f.p[0]) * f.t[0] + (p[1] - f.p[1]) * f.t[1]; };
const gaps = [];
for (const b of beamIds) {
  const G = verts(b).out;
  // the girder's mid-length vertices: its loft slices nearest the middle of its run
  const cx = G.reduce((s, p) => s + p[0], 0) / G.length, cy = G.reduce((s, p) => s + p[1], 0) / G.length;
  let lo = d0 - 50, hi = d1 + 50;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (along(m, [cx, cy]) > 0) lo = m; else hi = m; }
  const d = (lo + hi) / 2;
  if (d < d0 || d > d1) continue;
  const f = B.frame(d), t = f.t, left = [-t[1], t[0]];
  const loc = (q) => ({ a: (q[0] - f.p[0]) * t[0] + (q[1] - f.p[1]) * t[1], y: (q[0] - f.p[0]) * left[0] + (q[1] - f.p[1]) * left[1], z: q[2] });
  const Gl = G.map(loc);
  const amin = Math.min(...Gl.map((q) => Math.abs(q.a)));
  const Gn = Gl.filter((q) => Math.abs(q.a) < amin + 0.3);
  const D = deck.out.map(loc).filter((q) => Math.abs(q.a) < amin + 0.3);
  const top = Math.max(...Gn.map((q) => q.z));
  const ys = Gn.map((q) => q.y), yl = Math.min(...ys), yh = Math.max(...ys);
  const over = D.filter((q) => q.y >= yl - 0.05 && q.y <= yh + 0.05);
  const under = over.length ? Math.min(...over.map((q) => q.z)) : NaN;
  gaps.push(under - top);
  console.log(`girder #${b} at station ${d.toFixed(2)} y ${((yl + yh) / 2).toFixed(2)}: top ${top.toFixed(3)}, deck underside ${under.toFixed(3)}, gap ${(under - top).toFixed(3)} m`);
}
const ok = gaps.filter((x) => Number.isFinite(x));
console.log(`${ok.length} girders under the deck: gap ${Math.min(...ok).toFixed(3)} to ${Math.max(...ok).toFixed(3)} m`);
