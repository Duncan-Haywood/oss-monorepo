#!/usr/bin/env node
// The model fill end to end on real exports with their stored Lengths hidden:
// every IfcQuantityLength named 'Length' is renamed, the fill is asked for
// Qto_ Length on every column, beam, member and pile (member-lengths/
// member-lengths.ids.xml) with --from-geometry, and each written value is
// compared with the Length the exporter had stored on that element.
//   node eval/member-lengths-fill.mjs MODEL.ifc ... [--out DIR]   (DIR: the hidden and filled copies, for
//   eval/member_lengths_ifctester.py)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resources } from "../node.mjs";
import { fillModel } from "../model-fill.mjs";
import { measureModel, geometryLookup } from "../geometry-quantities.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";

const IDS = readFileSync(new URL("./member-lengths/member-lengths.ids.xml", import.meta.url), "utf8");
const CROSS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;
const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const outDir = oi >= 0 ? args.splice(oi, 2)[1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });
for (const f of args) {
  const orig = readFileSync(f, "utf8");
  // what was stored, in SI
  const stored = new Map();
  for (const r of takeoff(parseStep(orig)).rows) if (CROSS.test(r.ifcType) && r.stored?.Length?.value > 0) stored.set(r.id, r.stored.Length.value);
  const hidden = orig.replace(/IFCQUANTITYLENGTH\('Length'/g, "IFCQUANTITYLENGTH('LengthAsExported'");
  const t0 = Date.now();
  const geometry = geometryLookup(await measureModel(hidden));
  const r = fillModel(IDS, hidden, { ...resources(), geometry });
  const geo = r.writtenList.filter((w) => w.source === "geometry");
  // the written STEP value is in the model's length unit; the stored map is SI: compare by ratio to the measured lookup
  let cmp = 0, within2 = 0;
  const misses = [];
  for (const w of geo) {
    const s = stored.get(w.id);
    if (s == null) continue;
    cmp++;
    const si = geometry({ id: w.id }, "Length", "IFCQUANTITYLENGTH");
    if (Math.abs(si - s) / s <= 0.02) within2++; else if (misses.length < 5) misses.push(`#${w.id} stored ${s.toFixed(4)} written ${si.toFixed(4)} m`);
  }
  console.log(`${f.split("/").pop()}: ${geo.length} Lengths written from geometry (${r.written} in all), verified ${r.verified.pass} of ${r.written} pass; ${cmp} had a stored Length: ${within2} within 2%; ${r.unfilled.length} left to the to-fill table; ${(Date.now() - t0) / 1000} s`);
  for (const m of misses) console.log(`  ${m}`);
  if (outDir) {
    const base = f.split("/").pop().replace(/\.ifc$/i, "");
    writeFileSync(`${outDir}/${base}.hidden.ifc`, hidden);
    writeFileSync(`${outDir}/${base}.filled.ifc`, r.text);
  }
}
