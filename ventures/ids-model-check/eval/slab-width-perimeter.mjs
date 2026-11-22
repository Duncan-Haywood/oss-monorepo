#!/usr/bin/env node
// Slabs' Qto_ Width (thickness) and Perimeter read from their bodies
// (geometry-quantities.mjs slabLines / addSlabLines) against the figures
// their exporters stored. eval/slab-width-perimeter-2026-11-22.md.
//   node eval/slab-width-perimeter.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { solidExtent } from "../../ifc-quantity-takeoff/geom.mjs";
import { addSlabLines, quantitiesFromRows } from "../geometry-quantities.mjs";

const TOOLS = [[/archicad|graphisoft/i, "ARCHICAD"], [/revit/i, "Revit"], [/tekla/i, "Tekla"]];
const near = (a, b, t = 0.02) => Math.abs(a - b) <= t * b;
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = {};
const blank = () => ({ stored: 0, offered: 0, within2: 0, repeated: 0, misses: [], held: 0, heldRight: 0, faceted: 0, noReading: 0 });
const total = { Width: blank(), Perimeter: blank() };
for (const f of args) {
  const model = parseStep(readFileSync(f));
  const { rows } = takeoff(model);
  addSlabLines(model, rows, { solidExtent });
  const offered = quantitiesFromRows(rows);
  // one stored figure on several slabs whose readings differ by more than 2%
  // (a floor split into pieces, each storing the whole floor's figure),
  const groups = new Map();
  for (const r of rows) {
    if (!/^IFCSLAB/.test(r.ifcType)) continue;
    for (const q of ["Width", "Perimeter"]) {
      const v = r.stored?.[q]?.value, o = offered.get(r.id)?.get(q)?.value;
      if (!(v > 0) || o == null) continue;
      const k = `${q} ${v.toFixed(6)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
  }
  // or equal pieces whose readings add up to it (a mat in three pieces)
  const repeated = (r, q) => {
    const v = r.stored[q].value, g = groups.get(`${q} ${v.toFixed(6)}`) || [];
    return g.length >= 2 && (Math.max(...g) > 1.02 * Math.min(...g) || near(g.reduce((a, b) => a + b, 0), v));
  };
  const s = {};
  for (const r of rows) {
    if (!/^IFCSLAB/.test(r.ifcType)) continue;
    const tool = appTool(model, r.id);
    const m = r.computed?.slab;
    for (const q of ["Width", "Perimeter"]) {
      const st = r.stored?.[q];
      if (!(st?.value > 0)) continue;
      const x = ((s[`${tool} ${q}`] ||= blank()));
      const T = total[q];
      x.stored++; T.stored++;
      const o = offered.get(r.id)?.get(q)?.value;
      if (o != null) {
        x.offered++; T.offered++;
        if (near(o, st.value)) { x.within2++; T.within2++; }
        else if (repeated(r, q)) { x.repeated++; T.repeated++; }
        else if (x.misses.length < 8) x.misses.push({ id: r.id, name: r.name ?? null, stored: +st.value.toFixed(4), offered: +o.toFixed(4), faceted: !!r.computed?.solids?.body?.shells?.length });
        continue;
      }
      // why nothing was offered, and whether the held-back reading was right
      if (!m) { x.noReading++; T.noReading++; continue; }
      if (q === "Perimeter" ? m.gross == null : !m.extruded) { x.faceted++; T.faceted++; if (q === "Width" && near(m.thickness, st.value)) { x.facetedRight = (x.facetedRight || 0) + 1; T.facetedRight = (T.facetedRight || 0) + 1; } continue; }
      x.held++; T.held++;
      const reading = q === "Width" ? m.thickness : m.openings ? m.net : m.gross;
      if (reading != null && near(reading, st.value)) { x.heldRight++; T.heldRight++; }
      if (q === "Perimeter" && m.openings) { (x.openings ||= { gross: 0, net: 0, n: 0 }).n++; if (m.gross != null && near(m.gross, st.value)) x.openings.gross++; if (m.net != null && near(m.net, st.value)) x.openings.net++; }
    }
  }
  const name = f.split("/").pop();
  out[name] = s;
  console.log(`\n${name}`);
  console.log("tool quantity | stored | offered | within 2% | repeated stored figure | held back (held-back reading right) | faceted, not offered (thickness right) | no reading");
  for (const [k, v] of Object.entries(s).sort()) {
    console.log(`${k} | ${v.stored} | ${v.offered} | ${v.within2} | ${v.repeated} | ${v.held} (${v.heldRight}) | ${v.faceted}${v.facetedRight != null ? ` (${v.facetedRight})` : ""} | ${v.noReading}${v.openings ? ` | with openings ${v.openings.n}: gross outline right ${v.openings.gross}, net ${v.openings.net}` : ""}`);
    for (const w of v.misses) console.log(`  miss #${w.id} ${w.name}: stored ${w.stored}, offered ${w.offered}${w.faceted ? " (faceted)" : ""}`);
  }
}
for (const [q, T] of Object.entries(total)) console.log(`\nall ${q}: ${T.stored} stored; ${T.offered} offered, ${T.within2} within 2%, ${T.repeated} a repeated stored figure; ${T.held} held back (reading right on ${T.heldRight}); ${T.faceted} faceted${T.facetedRight != null ? ` (thickness right on ${T.facetedRight})` : ""}; ${T.noReading} no reading`);
out.total = total;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");

function appTool(model, id) {
  const E = model.entities;
  const name = (a) => { if (!a || a.type !== "IFCAPPLICATION") return ""; const d = E.get(a.args[0]?.ref); return [a.args[2], a.args[3], d?.args?.[1]].filter((t) => typeof t === "string").join(" "); };
  const oh = E.get(E.get(id)?.args?.[1]?.ref);
  let t = oh?.type === "IFCOWNERHISTORY" ? name(E.get(oh.args[1]?.ref)) : "";
  if (!t) for (const x of E.values()) if (x.type === "IFCAPPLICATION") { t = name(x); break; }
  return TOOLS.find(([re]) => re.test(t))?.[1] ?? "other";
}
