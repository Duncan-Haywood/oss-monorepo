#!/usr/bin/env node
// Wall Length and Height for the walls the 2026-11-21 axis check left out:
// faceted (brep, tessellated) bodies, and walls with no 'Axis', whose
// direction is read from the body's side faces (geometry-quantities.mjs
// wallLines, bodyDirection).
//   node eval/wall-brep-lengths.mjs MODEL.ifc ... [--json out.json]
//
// Two references, neither of them the code under test:
//   1. Held out: every wall with a straight axis and a stored Qto_ Length is
//      measured again with its axis ignored (direction from the body), and
//      compared with the stored figure and with the axis reading.
//   2. Revit's own wall dimensions: Revit exports write the wall's location
//      line length into a property set of its own (PSet_Revit_Dimensions
//      'Length'; French 'Cotes' 'Longueur'; Spanish 'Cotas' 'Longitud'),
//      also on walls with no Qto_ set. Every measured wall that carries one
//      is compared with it, split by how it was measured. Revit's figure runs
//      between the location line's join points, so a difference made of
//      halves or wholes of the joined walls' thicknesses is counted apart
//      (as eval/wall-axis-lengths.mjs does).
//   3. Faceted, held out: the same stored-Length walls with their extruded
//      pieces handed over as closed shells and every shell fanned into
//      tetrahedra (the path a non-convex brep takes through asTerms), axis
//      ignored too: Length against the stored figure, and Height offered
//      only on a level top.
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff, readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { Geometry, polyPlanes, asTerms } from "../../ifc-quantity-takeoff/geom.mjs";
import { addWallLines, wallLines, bodyDirection, straightAxis } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / b <= 0.02;
const REVIT_SET = /^(pset_revit_dimensions|dimensions|cotes|cotas|abmessungen)$/i;
const REVIT_LEN = /^(length|longueur|longitud|länge)$/i;
const out = {};

// every shell fanned into signed tetrahedra, convex or not (asTerms' fan)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function fanAll(sol) {
  const terms = [];
  for (const sh of sol.shells) {
    let c = [0, 0, 0], k = 0;
    for (const f of sh.loops) for (const p of f) { c = [c[0] + p[0], c[1] + p[1], c[2] + p[2]]; k++; }
    c = c.map((x) => x / k);
    for (const f of sh.loops) for (let i = 1; i + 1 < f.length; i++) {
      const a = f[0], b = f[i], d = f[i + 1];
      const v = dt(sub(a, c), crs(sub(b, c), sub(d, c)));
      if (Math.abs(v) < 1e-15) continue;
      const [p, q, r] = v > 0 ? [a, b, d] : [a, d, b];
      terms.push({ s: sh.s * Math.sign(v), faces: [[p, q, r], [c, q, p], [c, r, q], [c, p, r]] });
    }
  }
  return { terms, mesh: 0, shells: [], notes: [] };
}
const asShells = (b) => ({ terms: [], mesh: 1, shells: b.terms.map((t) => ({ s: t.s, loops: t.faces })), notes: [] });

for (const f of args) {
  const t0 = Date.now();
  const model = parseStep(readFileSync(f));
  const E = model.entities;
  const { rows } = takeoff(model);
  const units = readUnits(model);
  const geo = new Geometry(model, { angle: units.PLANEANGLEUNIT });
  addWallLines(model, rows, { Geometry, polyPlanes, readUnits, asTerms });
  // Revit's own length per element (SI)
  const revit = new Map();
  for (const e of E.values()) {
    if (e.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const pd = E.get(e.args[5]?.ref);
    if (!pd || pd.type !== "IFCPROPERTYSET" || !REVIT_SET.test(String(pd.args[2] ?? ""))) continue;
    for (const p of pd.args[4] || []) {
      const q = E.get(p?.ref);
      if (!q || q.type !== "IFCPROPERTYSINGLEVALUE" || !REVIT_LEN.test(String(q.args[0] ?? ""))) continue;
      const v = Number(q.args[2]?.value);
      if (!(v > 0)) continue;
      for (const o of e.args[4] || []) revit.set(o?.ref, v * units.LENGTHUNIT);
    }
  }
  const s = { walls: 0, measured: { "axis, extruded": 0, "axis, faceted": 0, "body, extruded": 0, "body, faceted": 0 }, heightsOffered: { "axis, extruded": 0, "axis, faceted": 0, "body, extruded": 0, "body, faceted": 0 },
    heldOut: { stored: 0, axisWithin2: 0, bodyWithin2: 0, bodyNone: 0, sameAsAxis: 0, heightSame: 0, heightBoth: 0 },
    facetedHeldOut: { stored: 0, none: 0, within2: 0, sameAsExtruded: 0, heightStored: 0, heightOffered: 0, heightWithin2: 0 },
    revit: {} };
  const misses = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const joinGap = (r, diff) => {
    const ws = [r.computed?.areas?.side?.width, ...(r.pathJoins || []).map((j) => byId.get(j)?.computed?.areas?.side?.width)].filter((w) => w > 0);
    const parts = [0, ...ws.flatMap((w) => [w / 2, w])];
    for (const a of parts) for (const b of parts) if (a + b > 0 && Math.abs(Math.abs(diff) - (a + b)) <= 0.006) return true;
    return false;
  };
  for (const r of rows) {
    if (!/^IFCWALL/.test(r.ifcType)) continue;
    s.walls++;
    const m = r.computed?.lines;
    const SL = (() => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "length" && k.toLowerCase() === "length") return q.value; return null; })();
    if (m) {
      const how = `${m.from}, ${m.faceted ? "faceted" : "extruded"}`;
      s.measured[how]++;
      if (m.height != null) s.heightsOffered[how]++;
      const RL = revit.get(r.id);
      if (RL) {
        const b = (s.revit[how] ??= { with: 0, within2: 0 });
        b.with++;
        if (near(m.length, RL)) b.within2++;
        else if (joinGap(r, RL - m.length)) b.joinGap = (b.joinGap || 0) + 1;
        else misses.push(["Revit length", how, r.id, r.name, m.length.toFixed(3), RL.toFixed(3)]);
      }
    }
    // held out: the axis ignored
    if (m && m.from === "axis" && SL > 0) {
      s.heldOut.stored++;
      if (near(m.length, SL)) s.heldOut.axisWithin2++;
      const dir = bodyDirection(r);
      const f2 = r.lengthUnit ?? units.LENGTHUNIT;
      let w = null;
      try { w = dir ? wallLines(r.computed.solids.body, dir, polyPlanes, { asTerms }) : null; } catch { w = null; }
      if (!w) { s.heldOut.bodyNone++; continue; }
      const L = w.length * f2;
      if (near(L, SL)) s.heldOut.bodyWithin2++;
      else misses.push(["held-out length", r.id, r.name, L.toFixed(3), m.length.toFixed(3), SL.toFixed(3)]);
      if (Math.abs(L - m.length) <= 1e-6 * Math.max(1, m.length)) s.heldOut.sameAsAxis++;
      const H = w.height * f2;
      if (m.extrusion > 0) { s.heldOut.heightBoth++; if (Math.abs(H - m.extrusion) <= 1e-6 * Math.max(1, H)) s.heldOut.heightSame++; }
      // faceted, held out
      const fo = s.facetedHeldOut;
      fo.stored++;
      let g = null;
      try { g = wallLines(asShells(r.computed.solids.body), dir, polyPlanes, { asTerms: fanAll }); } catch { g = null; }
      if (!g) { fo.none++; continue; }
      const GL = g.length * f2;
      if (near(GL, SL)) fo.within2++;
      if (Math.abs(GL - L) <= 1e-6 * Math.max(1, L)) fo.sameAsExtruded++;
      const SH = (() => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "length" && k.toLowerCase() === "height") return q.value; return null; })();
      const offered = g.flatTop && Math.abs(g.height - g.tallest) <= 0.005 * g.height;
      if (SH > 0) { fo.heightStored++; if (offered) { fo.heightOffered++; if (near(g.height * f2, SH)) fo.heightWithin2++; else misses.push(["faceted held-out height", r.id, r.name, (g.height * f2).toFixed(3), SH.toFixed(3)]); } }
    }
  }
  const name = f.split("/").pop();
  out[name] = { ...s, seconds: (Date.now() - t0) / 1000, misses };
  const total = Object.values(s.measured).reduce((a, b) => a + b, 0);
  console.log(`\n${name}: ${s.walls} walls, ${total} measured ${JSON.stringify(s.measured)}, ${out[name].seconds} s`);
  console.log(`  Heights offered: ${JSON.stringify(s.heightsOffered)}`);
  if (s.heldOut.stored) console.log(`  Held out (axis ignored), ${s.heldOut.stored} stored Lengths: axis within 2% ${s.heldOut.axisWithin2}, body direction within 2% ${s.heldOut.bodyWithin2} (no reading ${s.heldOut.bodyNone}; identical to the axis reading ${s.heldOut.sameAsAxis}); heights identical ${s.heldOut.heightSame} of ${s.heldOut.heightBoth}`);
  const fo = s.facetedHeldOut;
  if (fo.stored) console.log(`  Faceted, held out: ${fo.stored} stored Lengths, within 2% ${fo.within2} (no reading ${fo.none}; equal to the extruded reading ${fo.sameAsExtruded}); Height stored ${fo.heightStored}, offered (level top) ${fo.heightOffered}, within 2% ${fo.heightWithin2}`);
  if (Object.keys(s.revit).length) console.log(`  Revit's own length: ${JSON.stringify(s.revit)}`);
  for (const x of misses.slice(0, 8)) console.log("   ", x.join(" | "));
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
