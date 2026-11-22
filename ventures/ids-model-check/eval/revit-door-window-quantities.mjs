#!/usr/bin/env node
// Revit doors' and windows' Qto_ Width, Height and Area offered from the size
// parameters the export carries (geometry-quantities.mjs revitSizeLines /
// addRevitSizeLines) against the figures the exporter stored.
// eval/revit-door-window-quantities-2026-11-22.md.
//   node eval/revit-door-window-quantities.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff, readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { addRevitSizeLines, quantitiesFromRows } from "../geometry-quantities.mjs";

const near = (a, b, t) => Math.abs(a - b) <= t * Math.abs(b);
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const Q = ["Width", "Height", "Area", "Perimeter"];
const out = {};
for (const f of args) {
  const model = parseStep(readFileSync(f));
  const { rows } = takeoff(model);
  const got = addRevitSizeLines(model, rows, { readUnits });
  const offered = quantitiesFromRows(rows);
  const name = f.split("/").pop().replace(/\.ifc$/, "");
  const s = { elements: 0, read: got, q: {} };
  for (const r of rows) {
    if (!/^IFC(DOOR|WINDOW)/.test(r.ifcType)) continue;
    s.elements++;
    for (const q of Q) {
      const x = (s.q[q] ??= { stored: 0, offered: 0, offeredNoStored: 0, within2: 0, exact: 0, misses: [], sets: {} });
      const st = r.stored?.[q];
      const o = offered.get(r.id)?.get(q)?.value;
      if (!(st?.value > 0)) { if (o != null) x.offeredNoStored++; continue; }
      x.stored++;
      x.sets[st.set] = (x.sets[st.set] || 0) + 1;
      if (o == null) continue;
      x.offered++;
      if (near(o, st.value, 0.02)) x.within2++;
      if (near(o, st.value, 1e-4)) x.exact++;
      else if (x.misses.length < 6) x.misses.push({ id: r.id, cls: r.ifcType, name: r.name ?? null, set: st.set, stored: +st.value.toFixed(4), offered: +o.toFixed(4) });
    }
  }
  out[name] = s;
  console.log(`${name}: ${s.elements} doors+windows, ${got} with Revit size parameters read. stored/offered/within 2%/exact (stored set):`);
  for (const q of Q) {
    const x = s.q[q];
    if (!x) continue;
    console.log(`  ${q}: ${x.stored}/${x.offered}/${x.within2}/${x.exact} (${Object.entries(x.sets).map(([k, v]) => `${k} ${v}`).join(", ") || "none stored"}); offered where nothing is stored: ${x.offeredNoStored}`);
    for (const m of x.misses) console.log(`    miss #${m.id} ${m.cls} ${m.name} (${m.set}): stored ${m.stored}, offered ${m.offered}`);
  }
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
