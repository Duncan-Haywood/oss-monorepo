#!/usr/bin/env node
// Doors' and windows' Qto_ Width, Height, Area and Perimeter offered from the
// opening each fills (geometry-quantities.mjs openingLines / addOpeningLines)
// against the figures their exporters stored, and the element's own
// OverallWidth/OverallHeight against the same figures. eval/door-window-quantities-2026-11-22.md.
//   node eval/door-window-quantities.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { Geometry, solidExtent, sectionArea, mul, invert, transformSolid, asTerms } from "../../ifc-quantity-takeoff/geom.mjs";
import { addOpeningLines, quantitiesFromRows } from "../geometry-quantities.mjs";

const TOOLS = [[/archicad|graphisoft/i, "ARCHICAD"], [/revit/i, "Revit"], [/tekla/i, "Tekla"], [/allplan/i, "Allplan"], [/vectorworks/i, "Vectorworks"], [/ifcopenshell|blender|bonsai/i, "IfcOpenShell"]];
const near = (a, b, t = 0.02) => Math.abs(a - b) <= t * Math.abs(b);
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const Q = ["Width", "Height", "Area", "Perimeter"];
const out = {};
const total = Object.fromEntries(Q.map((q) => [q, { stored: 0, offered: 0, within2: 0 }]));
const tool = (model) => {
  for (const e of model.entities.values()) {
    if (e.type !== "IFCAPPLICATION") continue;
    const t = e.args.map((a) => (typeof a === "string" ? a : "")).join(" ");
    for (const [re, n] of TOOLS) if (re.test(t)) return n;
  }
  return "other";
};
for (const f of args) {
  const model = parseStep(readFileSync(f));
  const { rows } = takeoff(model);
  addOpeningLines(model, rows, { Geometry, readUnits, solidExtent, sectionArea, mul, invert, transformSolid, asTerms });
  const offered = quantitiesFromRows(rows);
  const name = f.split("/").pop().replace(/\.ifc$/, "");
  const s = { tool: tool(model), elements: 0, body: 0, attrs: 0, attr: { Width: { stored: 0, within2: 0 }, Height: { stored: 0, within2: 0 } }, q: Object.fromEntries(Q.map((q) => [q, { stored: 0, offered: 0, within2: 0, misses: [] }])) };
  for (const r of rows) {
    if (!/^IFC(DOOR|WINDOW)/.test(r.ifcType)) continue;
    s.elements++;
    const m = r.computed?.opening;
    if (r.computed?.status === "ok") s.body++;
    if (m) s.attrs++;
    // the element's own attributes against what it stores
    const e = model.entities.get(r.id), num = (v) => (typeof v === "number" ? v : v?.value);
    for (const [q, i] of [["Width", 9], ["Height", 8]]) {
      const st = r.stored?.[q]?.value, a = num(e.args[i]);
      if (!(st > 0) || !(a > 0)) continue;
      s.attr[q].stored++;
      if (near(a * (r.lengthUnit ?? 1), st)) s.attr[q].within2++;
    }
    for (const q of Q) {
      const st = r.stored?.[q];
      if (!(st?.value > 0)) continue;
      const x = s.q[q], T = total[q];
      x.stored++; T.stored++;
      // the opening's reading, offered or not
      const rd = m && { Width: m.openWidth, Height: m.openHeight, Area: m.section, Perimeter: 2 * (m.openWidth + m.openHeight) }[q];
      if (rd != null) { x.read = (x.read || 0) + 1; if (near(rd, st.value)) x.readWithin2 = (x.readWithin2 || 0) + 1; if (near(rd, st.value, 1e-4)) x.readExact = (x.readExact || 0) + 1; }
      const o = offered.get(r.id)?.get(q)?.value;
      if (o == null) continue;
      x.offered++; T.offered++;
      if (near(o, st.value)) { x.within2++; T.within2++; if (near(o, st.value, 1e-4)) { x.exact = (x.exact || 0) + 1; T.exact = (T.exact || 0) + 1; } }
      else if (x.misses.length < 8) x.misses.push({ id: r.id, cls: r.ifcType, name: r.name ?? null, set: st.set, stored: +st.value.toFixed(4), offered: +o.toFixed(4), opening: [+m.openWidth.toFixed(4), +m.openHeight.toFixed(4), m.section == null ? null : +m.section.toFixed(4)] });
    }
  }
  out[name] = s;
  const qs = Q.map((q) => `${q} ${s.q[q].stored}/${s.q[q].offered}/${s.q[q].within2}/${s.q[q].exact || 0}`).join("  ");
  const rq = Q.map((q) => `${q} ${s.q[q].read || 0}/${s.q[q].readWithin2 || 0}/${s.q[q].readExact || 0}`).join("  ");
  const at = ["Width", "Height"].map((q) => `${q} ${s.attr[q].within2}/${s.attr[q].stored}`).join(", ");
  console.log(`${name} [${s.tool}]: ${s.elements} doors+windows, ${s.body} with a body, ${s.attrs} read from their opening. stored/offered/within 2%/exact: ${qs}. OverallWidth/Height within 2% of stored: ${at}. Opening read/within 2%/exact, offered or not: ${rq}`);
  for (const q of Q) for (const mi of s.q[q].misses) console.log(`   miss ${q} #${mi.id} ${mi.cls} ${mi.name} (${mi.set}): stored ${mi.stored}, offered ${mi.offered}; opening ${mi.opening.join(" x ")}`);
}
console.log(`\nAll: ${Q.map((q) => `${q} stored ${total[q].stored}, offered ${total[q].offered}, within 2% ${total[q].within2}, exact ${total[q].exact || 0}`).join("; ")}`);
if (json) writeFileSync(json, JSON.stringify({ models: out, total }, null, 1) + "\n");
