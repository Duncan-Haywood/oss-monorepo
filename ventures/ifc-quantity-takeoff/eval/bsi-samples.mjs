// The takeoff over buildingSMART's IFC4.3.x-sample-models, against IfcOpenShell.
//
//   node eval/bsi-samples.mjs models/ [ios.json]
//
// models/ is the `models` folder of a clone of
// github.com/buildingSMART/IFC4.3.x-sample-models: 47 small files, each
// showing one concept of the standard (advanced breps, CSG, swept disks along
// indexed curves, grid and linear placements, mapped items, tessellations).
// Prints, per file, how many elements were read and why the rest were not;
// with ios.json (eval/bsi-samples-ifcopenshell.py) each element's volume
// (within 1%) and world box (within 2 mm) against IfcOpenShell's.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, rowQuantities } from "../qto.mjs";

const [root, refFile] = process.argv.slice(2);
const ref = refFile ? JSON.parse(readFileSync(refFile, "utf8")) : null;
const walk = (d) => readdirSync(d).sort().flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith(".ifc") ? [p] : []; });

const tot = { files: 0, elements: 0, read: 0, compared: 0, volOk: 0, boxOk: 0, notRead: {} };
const misses = [];
for (const p of walk(root)) {
  const rel = relative(root, p);
  let res;
  try { res = takeoff(parseStep(readFileSync(p))); } catch (err) { console.log(`${rel}: FAILED ${err.message}`); tot.files++; continue; }
  tot.files++;
  const rows = res.rows;
  const read = rows.filter((r) => r.computed?.status === "ok");
  tot.elements += rows.length; tot.read += read.length;
  for (const r of rows) if (r.computed && r.computed.status !== "ok") { const k = r.computed.reason ?? r.computed.status; tot.notRead[k] = (tot.notRead[k] ?? 0) + 1; }
  const R = ref?.[rel] ?? {};
  let cmp = 0, vok = 0, bok = 0;
  for (const r of read) {
    const o = R[r.globalId];
    if (!o) continue;
    cmp++;
    const v = r.computed.net ?? r.computed.gross;
    const dv = o.volume ? (v - o.volume) / o.volume : v === 0 ? 0 : Infinity;
    const vgood = Math.abs(dv) <= 0.01;
    const db = r.box ? Math.max(...r.box.map((x, i) => Math.abs(x - o.box[i]))) : Infinity;
    const bgood = db <= 0.002;
    if (vgood) vok++;
    if (bgood) bok++;
    if (!vgood || !bgood) misses.push(`  ${rel} #${r.id} ${r.ifcClass}: volume ${v.toFixed(6)} vs ${o.volume.toFixed(6)} m3 (${(dv * 100).toFixed(3)}%), box off by ${(db * 1000).toFixed(2)} mm`);
  }
  tot.compared += cmp; tot.volOk += vok; tot.boxOk += bok;
  const q = read.map(rowQuantities);
  const len = q.reduce((s, x) => s + (x.length ?? 0), 0), kg = q.reduce((s, x) => s + (x.weight ?? 0), 0);
  console.log(`${rel}: ${read.length} of ${rows.length} read${ref ? `; vs IfcOpenShell ${cmp} compared, volume ${vok}, box ${bok}` : ""}${len ? `; length ${len.toFixed(3)} m` : ""}${kg ? `; weight ${kg.toFixed(2)} kg` : ""}`);
}
console.log(`\n${tot.files} files, ${tot.read} of ${tot.elements} elements read; not read: ${JSON.stringify(tot.notRead)}`);
if (ref) console.log(`vs IfcOpenShell: ${tot.compared} elements both read; volume within 1%: ${tot.volOk}; world box within 2 mm: ${tot.boxOk}`);
if (misses.length) console.log("disagreements:\n" + misses.join("\n"));
