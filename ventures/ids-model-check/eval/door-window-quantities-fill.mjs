#!/usr/bin/env node
// The model fill end to end on real exports with their stored door and window
// figures hidden: every quantity named Width, Height, Area or Perimeter is
// renamed, the fill is asked for Qto_DoorBaseQuantities and
// Qto_WindowBaseQuantities Width, Height, Area and Perimeter on every door and
// window (door-window-quantities/door-window-quantities.ids.xml) with
// --from-geometry, and each written value is compared with the figure the
// exporter had stored on that element. eval/door-window-quantities-2026-11-22.md.
//   node eval/door-window-quantities-fill.mjs MODEL.ifc ... [--out DIR]   (DIR: the hidden and filled copies, for
//   eval/door_window_quantities_ifctester.py)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resources } from "../node.mjs";
import { fillModel } from "../model-fill.mjs";
import { measureModel, geometryLookup } from "../geometry-quantities.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";

const IDS = readFileSync(new URL("./door-window-quantities/door-window-quantities.ids.xml", import.meta.url), "utf8");
const Q = ["Width", "Height", "Area", "Perimeter"];
const QCLASS = { Width: "IFCQUANTITYLENGTH", Height: "IFCQUANTITYLENGTH", Area: "IFCQUANTITYAREA", Perimeter: "IFCQUANTITYLENGTH" };
const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const outDir = oi >= 0 ? args.splice(oi, 2)[1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });
for (const f of args) {
  const orig = readFileSync(f, "utf8");
  const stored = new Map();
  for (const r of takeoff(parseStep(orig)).rows) {
    if (!/^IFC(DOOR|WINDOW)/.test(r.ifcType)) continue;
    for (const q of Q) if (r.stored?.[q]?.value > 0) stored.set(`${r.id} ${q}`, r.stored[q].value);
  }
  const hidden = orig.replace(/IFCQUANTITY(LENGTH|AREA)\('(Width|Height|Area|Perimeter)'/g, "IFCQUANTITY$1('$2AsExported'");
  const t0 = Date.now();
  const geometry = geometryLookup(await measureModel(hidden));
  const r = fillModel(IDS, hidden, { ...resources(), geometry });
  const geo = r.writtenList.filter((w) => w.source === "geometry");
  const c = Object.fromEntries(Q.map((q) => [q, { written: 0, cmp: 0, within2: 0, misses: [] }]));
  for (const w of geo) {
    const q = Q.find((x) => w.prop === x);
    if (!q) continue;
    const x = c[q];
    x.written++;
    const s = stored.get(`${w.id} ${q}`);
    if (s == null) continue;
    x.cmp++;
    const si = geometry({ id: w.id }, q, QCLASS[q]);
    if (Math.abs(si - s) / s <= 0.02) x.within2++; else if (x.misses.length < 5) x.misses.push(`#${w.id} stored ${s.toFixed(4)} written ${si.toFixed(4)} (SI)`);
  }
  const parts = Q.map((q) => `${q}: ${c[q].written} written, ${c[q].cmp} with a stored figure, ${c[q].within2} within 2%`).join("; ");
  console.log(`${f.split("/").pop()}: ${geo.length} written from geometry (${r.written} in all), verified ${r.verified.pass} of ${r.written} pass; ${parts}; ${r.unfilled.length} left to the to-fill table; ${(Date.now() - t0) / 1000} s`);
  for (const q of Q) for (const m of c[q].misses) console.log(`  ${q} ${m}`);
  if (outDir) {
    const base = f.split("/").pop().replace(/\.ifc$/i, "");
    writeFileSync(`${outDir}/${base}.hidden.ifc`, hidden);
    writeFileSync(`${outDir}/${base}.filled.ifc`, r.text);
  }
}
