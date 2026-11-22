#!/usr/bin/env node
// Clipped walls' Height by the authoring tool's convention
// (geometry-quantities.mjs heightConvention, offeredHeight).
//   node --max-old-space-size=7000 eval/wall-cut-top-heights.mjs MODEL.ifc ... [--json out.json]
//
// A faceted body is not held out here the way eval/wall-brep-lengths.mjs
// does it (an extruded wall's pieces fanned into tetrahedra): that keeps the
// uncut box as a shell, where a real brep's faces hold the cut, so it says
// nothing about the faceted rule (a brep's own extent is its highest point).
//
// References, none of them the code under test:
//   1. Every wall that stores a Qto_ Height: the offered Height against it,
//      clipped and unclipped walls apart, and on the clipped ones how often
//      the *other* reading (extrusion or tallest) would have matched instead.
//   2. Revit's own constraints, a candidate this run tried and did not ship:
//      base level + base offset to top level + top offset (or the unconnected
//      height), with the storeys' elevations, against stored Heights.
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff, readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { Geometry, polyPlanes, asTerms } from "../../ifc-quantity-takeoff/geom.mjs";
import { addWallLines } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / b <= 0.02;
const out = {};

const RK = {
  base: /^(base constraint|abhängigkeit unten|contrainte inférieure)$/i,
  baseOff: /^(base offset|versatz unten|décalage inférieur)$/i,
  top: /^(top constraint|abhängigkeit oben|contrainte supérieure)$/i,
  topOff: /^(top offset|versatz oben|décalage supérieur)$/i,
  uh: /^(unconnected height|nicht verknüpfte höhe|hauteur non contrainte)$/i,
  att: /^(top is attached|oberkante ist fixiert\.?|partie supérieure attachée)$/i,
};

for (const f of args) {
  const t0 = Date.now();
  const model = parseStep(readFileSync(f));
  const E = model.entities;
  const { rows } = takeoff(model);
  const units = readUnits(model);
  addWallLines(model, rows, { Geometry, polyPlanes, readUnits, asTerms });
  const apps = [...new Set([...E.values()].filter((e) => e.type === "IFCAPPLICATION").map((e) => String(e.args[2])))];
  // Revit constraints and storey elevations
  const lev = new Map();
  for (const e of E.values()) if (e.type === "IFCBUILDINGSTOREY") { const v = typeof e.args[9] === "number" ? e.args[9] : Number(e.args[9]?.value); if (Number.isFinite(v)) lev.set(String(e.args[2]).trim(), v * units.LENGTHUNIT); }
  const C = new Map();
  for (const e of E.values()) {
    if (e.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const pd = E.get(e.args[5]?.ref);
    if (!pd || pd.type !== "IFCPROPERTYSET") continue;
    const kv = {};
    for (const p of pd.args[4] || []) { const q = E.get(p?.ref); if (!q || q.type !== "IFCPROPERTYSINGLEVALUE") continue; const nm = String(q.args[0]).trim(); for (const [k, re] of Object.entries(RK)) if (re.test(nm)) kv[k] = q.args[2]?.value ?? q.args[2]; }
    if (!("base" in kv)) continue;
    for (const o of e.args[4] || []) C.set(o?.ref, { ...(C.get(o?.ref) || {}), ...kv });
  }
  const strip = (s) => String(s ?? "").replace(/^[^:]*:\s*/, "").trim();
  const constraintHeight = (c) => {
    const b = lev.get(strip(c.base)) ?? lev.get(String(c.base).trim());
    if (b == null) return null;
    const t = c.top == null ? "" : String(c.top);
    if (!t || /^unconnected/i.test(t)) return Number(c.uh) * units.LENGTHUNIT;
    const tl = lev.get(strip(t));
    return tl == null ? null : tl + Number(c.topOff ?? 0) * units.LENGTHUNIT - b - Number(c.baseOff ?? 0) * units.LENGTHUNIT;
  };
  const s = { walls: 0, measured: 0, clipped: 0, offeredBefore: 0, offeredAfter: 0, newByConvention: {}, clippedLeft: { faceted: 0, extruded: 0, noConvention: 0 },
    stored: { unclipped: 0, unclippedWithin2: 0, clipped: 0, clippedOffered: 0, clippedWithin2: 0, otherReadingWithin2: 0 },
    revit: { stored: 0, attached: 0, attachedWithin2: 0, unattached: 0, unattachedWithin2: 0, noLevel: 0 } };
  const misses = [];
  for (const r of rows) {
    if (!/^IFCWALL/.test(r.ifcType)) continue;
    s.walls++;
    const m = r.computed?.lines;
    if (!m) continue;
    s.measured++;
    if (!m.clipped) { s.offeredBefore++; s.offeredAfter++; }
    else {
      s.clipped++;
      if (m.height != null) { s.offeredAfter++; s.newByConvention[m.convention] = (s.newByConvention[m.convention] || 0) + 1; }
      else if (!m.convention) s.clippedLeft.noConvention++;
      else s.clippedLeft[m.faceted ? "faceted" : "extruded"]++;
    }
    let SH = null;
    for (const [k, q] of Object.entries(r.stored)) if (q.kind === "length" && k.toLowerCase() === "height") SH = q.value;
    if (SH > 0) {
      if (!m.clipped) { s.stored.unclipped++; if (near(m.height, SH)) s.stored.unclippedWithin2++; else misses.push(["unclipped", r.id, r.name, m.height?.toFixed(3), SH.toFixed(3)]); }
      else {
        s.stored.clipped++;
        if (m.height != null) {
          s.stored.clippedOffered++;
          if (near(m.height, SH)) s.stored.clippedWithin2++; else misses.push(["clipped", m.convention, r.id, r.name, m.height.toFixed(3), SH.toFixed(3)]);
          const other = m.heightFrom === "tallest" ? m.extrusion : m.tallest;
          if (near(other, SH)) s.stored.otherReadingWithin2++;
        }
      }
      const c = C.get(r.id);
      if (c) {
        s.revit.stored++;
        const H = constraintHeight(c);
        const att = c.att === true;
        if (H == null) s.revit.noLevel++;
        else if (att) { s.revit.attached++; if (near(H, SH)) s.revit.attachedWithin2++; }
        else { s.revit.unattached++; if (near(H, SH)) s.revit.unattachedWithin2++; }
      }
    }
  }
  const name = f.split("/").pop();
  out[name] = { apps, ...s, seconds: (Date.now() - t0) / 1000, misses };
  console.log(`\n${name} (${apps.join("; ")}): ${s.walls} walls, ${s.measured} measured, ${s.clipped} clipped; Heights offered ${s.offeredBefore} -> ${s.offeredAfter} ${JSON.stringify(s.newByConvention)}; clipped left ${JSON.stringify(s.clippedLeft)}, ${out[name].seconds} s`);
  if (s.stored.unclipped + s.stored.clipped) console.log(`  Stored Heights: unclipped ${s.stored.unclippedWithin2}/${s.stored.unclipped} within 2%; clipped ${s.stored.clipped}, offered ${s.stored.clippedOffered}, within 2% ${s.stored.clippedWithin2} (the other reading ${s.stored.otherReadingWithin2})`);
  if (s.revit.stored) console.log(`  Revit constraints vs stored: unattached ${s.revit.unattachedWithin2}/${s.revit.unattached}, top attached ${s.revit.attachedWithin2}/${s.revit.attached}, a level not a storey ${s.revit.noLevel}`);
  for (const x of misses.slice(0, 8)) console.log("   ", x.join(" | "));
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
