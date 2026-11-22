#!/usr/bin/env node
// Footings' Qto_FootingBaseQuantities read from their bodies
// (geometry-quantities.mjs footingLines, run by addFootingLines) against the
// figures their exporters stored. eval/footing-quantities-2026-11-22.md.
//   node eval/footing-quantities.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { solidExtent } from "../../ifc-quantity-takeoff/geom.mjs";
import { addFootingLines, quantitiesFromRows, toolConvention } from "../geometry-quantities.mjs";

const TOOLS = [[/archicad|graphisoft/i, "ARCHICAD"], [/revit/i, "Revit"], [/tekla/i, "Tekla"]];
const NAMES = ["Length", "Width", "Height", "CrossSectionArea", "OuterSurfaceArea", "GrossSurfaceArea"];
const near = (a, b, t = 0.01) => b > 0 && Math.abs(a - b) <= t * b;
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const total = {};
const out = { files: {}, misses: [], held: [] };
for (const f of args) {
  let model, rows;
  try { model = parseStep(readFileSync(f)); rows = takeoff(model).rows; } catch (e) { console.log(`${f}: not read (${e.message})`); continue; }
  addFootingLines(model, rows, { solidExtent });
  const offered = quantitiesFromRows(rows);
  const file = f.split("/").pop();
  let footings = 0;
  for (const r of rows) {
    if (!/^IFCFOOTING/.test(r.ifcType)) continue;
    footings++;
    const tool = toolConvention(model, model.entities.get(r.id), TOOLS) || "other";
    const ft = r.computed?.footing;
    const kind = ft ? (ft.pad ? "pad" : "other") : "not read";
    for (const q of NAMES) {
      const st = r.stored?.[q]?.value;
      if (!(st > 0)) continue;
      const k = `${tool} ${kind} ${q}`;
      const t = (total[k] ||= { stored: 0, offered: 0, within1: 0, misses: 0, held: 0 });
      t.stored++;
      const o = offered.get(r.id)?.get(q)?.value;
      if (o == null) { t.held++; if (out.held.length < 200) out.held.push({ file, id: r.id, name: r.name, profile: model.entities.get(r.id).args[4], q, stored: +st.toFixed(5), dims: ft?.dims?.map((d) => +d.toFixed(4)) }); continue; }
      t.offered++;
      if (near(o, st)) t.within1++;
      else { t.misses++; if (out.misses.length < 200) out.misses.push({ file, id: r.id, name: r.name, profile: model.entities.get(r.id).args[4], q, stored: +st.toFixed(5), offered: +o.toFixed(5), dims: ft?.dims?.map((d) => +d.toFixed(4)) }); }
    }
  }
  out.files[file] = footings;
}
console.log("files (footings):", Object.entries(out.files).filter(([, n]) => n).map(([f, n]) => `${f} (${n})`).join(", ") || "none");
console.log("tool kind name: stored; offered, within 1%, misses; held back");
for (const [k, t] of Object.entries(total).sort()) console.log(`${k}: ${t.stored}; ${t.offered}, ${t.within1}, ${t.misses}; ${t.held}`);
const why = {};
for (const m of [...out.misses.map((x) => ({ ...x, w: "miss" })), ...out.held.map((x) => ({ ...x, w: "held" }))]) { const k = `${m.w} ${m.q} ${m.profile}`; why[k] = (why[k] || 0) + 1; }
console.log("\nmisses and held back by name and profile:");
for (const [k, n] of Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n} ${k}`);
out.total = total;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
