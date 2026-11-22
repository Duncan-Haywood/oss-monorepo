#!/usr/bin/env node
// The model fill end to end on real exports with their stored space figures
// hidden: every quantity named as one of the eight Qto_SpaceBaseQuantities the
// geometry offers is renamed, the fill is asked for them on every IfcSpace
// (space-quantities/space-quantities.ids.xml) with --from-geometry, and each
// written value is compared with the figure the exporter had stored on that
// space. eval/space-quantities-2026-11-22.md. Run from the folder holding the
// models (ThatOpen/engine_web-ifc tests/ifcfiles/public, sparse clone).
//   node eval/space-quantities-fill.mjs MODEL.ifc ... [--json out.json] [--out DIR]
// (DIR: the hidden and filled copies, for eval/space_quantities_ifctester.py)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resources } from "../node.mjs";
import { fillModel } from "../model-fill.mjs";
import { measureModel, geometryLookup } from "../geometry-quantities.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";

const IDS = readFileSync(new URL("./space-quantities/space-quantities.ids.xml", import.meta.url), "utf8");
const QCLASS = { GrossFloorArea: "IFCQUANTITYAREA", NetFloorArea: "IFCQUANTITYAREA", GrossPerimeter: "IFCQUANTITYLENGTH", Height: "IFCQUANTITYLENGTH", FinishCeilingHeight: "IFCQUANTITYLENGTH", GrossCeilingArea: "IFCQUANTITYAREA", GrossVolume: "IFCQUANTITYVOLUME", NetVolume: "IFCQUANTITYVOLUME" };
const Q = Object.keys(QCLASS);
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const oi = args.indexOf("--out");
const outDir = oi >= 0 ? args.splice(oi, 2)[1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });
const out = {};
const total = Object.fromEntries(Q.map((q) => [q, { written: 0, cmp: 0, within2: 0, unitSlip: 0, misses: 0 }]));
for (const f of args) {
  const orig = readFileSync(f, "utf8");
  const stored = new Map();
  const { rooms } = takeoff(parseStep(orig));
  for (const r of rooms) for (const q of Q) if (r.stored?.[q]?.value > 0) stored.set(`${r.id} ${q}`, r.stored[q].value);
  const re = new RegExp(`IFCQUANTITY(LENGTH|AREA|VOLUME)\\('(${Q.join("|")})'`, "g");
  const hidden = orig.replace(re, "IFCQUANTITY$1('$2AsExported'");
  const t0 = Date.now();
  const geometry = geometryLookup(await measureModel(hidden));
  const r = fillModel(IDS, hidden, { ...resources(), geometry });
  const geo = r.writtenList.filter((w) => w.source === "geometry");
  const c = Object.fromEntries(Q.map((q) => [q, { written: 0, cmp: 0, within2: 0, misses: [] }]));
  for (const w of geo) {
    const x = c[w.prop];
    if (!x) continue;
    x.written++;
    const s = stored.get(`${w.id} ${w.prop}`);
    if (s == null) continue;
    x.cmp++;
    const si = geometry({ id: w.id }, w.prop, QCLASS[w.prop]);
    const pow = Math.round(Math.log10(s / si));
    if (Math.abs(si - s) / s <= 0.02) x.within2++;
    else if (pow !== 0 && Math.abs(si * 10 ** pow - s) <= 0.005 * s) x.unitSlip = (x.unitSlip || 0) + 1;
    else x.misses.push({ id: w.id, stored: +s.toFixed(4), written: +si.toFixed(4), ratio: +(si / s).toFixed(4) });
  }
  for (const q of Q) { for (const k of ["written", "cmp", "within2"]) total[q][k] += c[q][k]; total[q].unitSlip += c[q].unitSlip || 0; total[q].misses += c[q].misses.length; }
  const name = f.split("/").pop();
  out[name] = { spaces: rooms.length, written: r.written, fromGeometry: geo.length, verifiedPass: r.verified.pass, unfilled: r.unfilled.length, seconds: (Date.now() - t0) / 1000, byName: c };
  console.log(`\n${name}: ${rooms.length} spaces; ${geo.length} written from geometry (${r.written} in all), verified ${r.verified.pass} of ${r.written} pass; ${r.unfilled.length} left to the to-fill table; ${out[name].seconds} s`);
  if (outDir) {
    const base = name.replace(/\.ifc$/i, "");
    writeFileSync(`${outDir}/${base}.hidden.ifc`, hidden);
    writeFileSync(`${outDir}/${base}.filled.ifc`, r.text);
  }
  for (const q of Q) if (c[q].written || c[q].cmp) console.log(`  ${q}: ${c[q].written} written, ${c[q].cmp} with a stored figure, ${c[q].within2} within 2%${c[q].unitSlip ? `, ${c[q].unitSlip} the stored figure a power of ten off (an exporter's unit slip)` : ""}${c[q].misses.length ? `; misses ${c[q].misses.slice(0, 4).map((m) => `#${m.id} x${m.ratio}`).join(", ")}${c[q].misses.length > 4 ? " ..." : ""}` : ""}`);
}
console.log("\nAll models:");
for (const q of Q) console.log(`  ${q}: ${total[q].written} written, ${total[q].cmp} with a stored figure, ${total[q].within2} within 2%, ${total[q].unitSlip} unit slips, ${total[q].misses} other misses`);
if (json) writeFileSync(json, JSON.stringify({ models: out, total }, null, 1) + "\n");
