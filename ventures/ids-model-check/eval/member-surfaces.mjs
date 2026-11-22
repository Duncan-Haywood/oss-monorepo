#!/usr/bin/env node
// Columns', beams', members' and piles' Qto_ OuterSurfaceArea and
// GrossSurfaceArea read from their bodies (geometry-quantities.mjs
// memberSurface, run by addMemberLines) against the figures their exporters
// stored. eval/member-surfaces-2026-11-22.md.
//   node eval/member-surfaces.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { solidExtent } from "../../ifc-quantity-takeoff/geom.mjs";
import { addMemberLines, memberSurface, quantitiesFromRows, toolConvention } from "../geometry-quantities.mjs";

const CROSS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;
const TOOLS = [[/archicad|graphisoft/i, "ARCHICAD"], [/revit/i, "Revit"], [/tekla/i, "Tekla"]];
const NAMES = ["OuterSurfaceArea", "GrossSurfaceArea"];
const near = (a, b, t = 0.02) => b > 0 && Math.abs(a - b) <= t * b;
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const blank = () => ({ stored: 0, offered: 0, within2: 0, unitSlip: 0, misses: 0, held: 0, heldSideRight: 0, heldTotalRight: 0, noReading: 0 });
const total = {};
const out = { files: {}, misses: [] };
for (const f of args) {
  let model, rows;
  try { model = parseStep(readFileSync(f)); rows = takeoff(model).rows; } catch (e) { console.log(`${f}: not read (${e.message})`); continue; }
  addMemberLines(model, rows, { solidExtent });
  const offered = quantitiesFromRows(rows);
  const file = f.split("/").pop();
  for (const r of rows) {
    if (!CROSS.test(r.ifcType)) continue;
    const tool = toolConvention(model, model.entities.get(r.id), TOOLS) || "other";
    for (const q of NAMES) {
      const st = r.stored?.[q]?.value;
      if (!(st > 0)) continue;
      const k = `${tool} ${q}`;
      const t = (total[k] ||= blank());
      t.stored++;
      const o = offered.get(r.id)?.get(q)?.value;
      const sf = r.computed?.surface ?? (r.computed?.status === "ok" ? memberSurface(r, solidExtent) : null);
      if (o == null) {
        if (!sf) { t.noReading++; continue; }
        t.held++;
        if (near(sf.side, st)) t.heldSideRight++;
        else if (near(sf.total, st)) t.heldTotalRight++;
        continue;
      }
      t.offered++;
      if (near(o, st)) t.within2++;
      else if (near(o * 1e6, st)) t.unitSlip++; // mm2 written under an m2 unit
      else {
        t.misses++;
        if (out.misses.length < 400) out.misses.push({ file, id: r.id, name: r.name, tool, q, stored: +st.toFixed(5), offered: +o.toFixed(5), side: +sf.side.toFixed(5), total: +sf.total.toFixed(5), from: sf.from });
      }
    }
  }
  out.files[file] = true;
}
console.log("tool name: stored; offered, within 2%, mm2-as-m2 slip, other misses; held back (side right, total right); no square-ended straight reading");
for (const [k, t] of Object.entries(total).sort()) console.log(`${k}: ${t.stored}; ${t.offered}, ${t.within2}, ${t.unitSlip}, ${t.misses}; ${t.held} (${t.heldSideRight}, ${t.heldTotalRight}); ${t.noReading}`);
const byName = {};
for (const m of out.misses) { const k = `${m.file} ${m.tool} ${m.q} ${(m.name || "").replace(/[0-9.,*/x ]+$/i, "")}`; byName[k] = (byName[k] || 0) + 1; }
console.log("\nmisses by file and part name:");
for (const [k, n] of Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n} ${k}`);
out.total = total;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
