// Every IfcAdvancedBrep read here against IfcOpenShell's volume of it.
//
//   node eval/breps-vs-ifcopenshell.mjs model.ifc breps.json [--list N]
//
// breps.json comes from `eval/ifcopenshell-volumes.py model.ifc breps.json
// --breps` (each brep on its own, finely tessellated). A brep agrees within
// 0.1%. A disagreement is put down to the first of:
//   ifcopenshell-over-box  IfcOpenShell's volume is larger than the brep's
//                          bounding box: no solid can be, so its figure is wrong
//   ifcopenshell-turned    IfcOpenShell's mesh has faces turned the wrong way
//                          (directed edges not paired with their reverse,
//                          eval/pole-faces-2026-11-22.md) and the same
//                          triangles, turned to agree, enclose this tool's
//                          volume within 0.5% (an inscribed mesh's 0.02-0.3%);
//                          needs breps.json written with the orientation check
//   overlapping-pieces     the shell is in pieces whose boxes overlap (lumps
//                          an exporter wrote as one shell); summed here, each
//                          overlap counts once per piece (the reading's note).
//                          Tested before ifcopenshell-turned: the turned figure
//                          sums each piece right way out too, so it agrees
//                          with this tool there without explaining anything
//   not-closed             an edge is not used by exactly two faces (pieces
//                          touching along an edge): volume from the faces as
//                          written, no section
//   unexplained            none of these
// Breps not read (a face round a whole closed surface, bounds off their
// surface, ...) are counted by reason.

import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { Geometry, solidVolume } from "../geom.mjs";

const args = process.argv.slice(2);
const listAt = args.indexOf("--list");
const listN = listAt >= 0 ? Number(args[listAt + 1]) : 10;
const [file, refFile] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--list");
const model = parseStep(readFileSync(file));
const ref = JSON.parse(readFileSync(refFile, "utf8"));
const geo = new Geometry(model);
const E = model.entities;

const counts = { breps: 0, read: 0, agree: 0 };
const why = {}, notRead = {}, bySurface = {};
const left = [];
for (const [id, e] of E) {
  if (e.type !== "IFCADVANCEDBREP" && e.type !== "IFCADVANCEDBREPWITHVOIDS") continue;
  counts.breps++;
  const surfaces = [...new Set(E.get(e.args[0].ref).args[0].map((f) => E.get(E.get(f.ref).args[1].ref).type.replace(/^IFC/, "").toLowerCase()))].sort().join("+");
  const g = (bySurface[surfaces] ??= { breps: 0, read: 0, agree: 0 });
  g.breps++;
  let s;
  try { s = geo.item(id); } catch (err) { notRead[err.message] = (notRead[err.message] || 0) + 1; continue; }
  counts.read++; g.read++;
  // a plain number, or {volume, turned, unpaired, pieces} when IfcOpenShell's
  // mesh has directed edges without a reverse (eval/ifcopenshell-volumes.py)
  const r = ref[id];
  const v = Math.abs(solidVolume(s)), q = r == null ? null : Math.abs(typeof r === "object" ? r.volume : r);
  const qt = r != null && typeof r === "object" ? Math.abs(r.turned) : null;
  if (q == null) { why["not built by IfcOpenShell"] = (why["not built by IfcOpenShell"] || 0) + 1; continue; }
  if (Math.abs(v - q) <= 1e-3 * q || Math.abs(v - q) < 1e-12) { counts.agree++; g.agree++; continue; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of geo.advancedShellLoops(e.args[0])) for (const l of f) for (const p of l) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const box = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  const reason = q > box * 1.001 ? "ifcopenshell-over-box"
    : s.notes.some((n) => /pieces that may overlap/.test(n)) ? "overlapping-pieces"
    : qt != null && Math.abs(v - qt) <= 5e-3 * qt ? "ifcopenshell-turned"
    : !s.shells && !s.terms.length ? "not-closed"
    : "unexplained";
  why[reason] = (why[reason] || 0) + 1;
  left.push({ id, reason, v, q, qt, unpaired: r?.unpaired, box, surfaces });
}
console.log(`${file.split("/").pop()}: ${counts.breps} advanced breps, read ${counts.read}, agree within 0.1% ${counts.agree}`);
for (const [k, g] of Object.entries(bySurface)) console.log(`  faces on ${k}: ${g.breps} breps, read ${g.read}, agree ${g.agree}`);
console.log(`  disagreements: ${Object.entries(why).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
// whatever reason came first: on how many does IfcOpenShell's own mesh, turned
// to agree, enclose this tool's volume (the over-box figures are mostly this)
const turnedBy = {};
for (const x of left) if (x.qt != null && Math.abs(x.v - x.qt) <= 5e-3 * x.qt) turnedBy[x.reason] = (turnedBy[x.reason] || 0) + 1;
if (Object.keys(turnedBy).length) console.log(`  IfcOpenShell turned to agree matches here within 0.5%: ${Object.entries(turnedBy).map(([k, n]) => `${n} of ${why[k]} ${k}`).join(", ")}`);
console.log(`  not read: ${Object.entries(notRead).map(([k, n]) => `${n} x ${k}`).join(", ") || "none"}`);
const order = ["unexplained", "not-closed", "overlapping-pieces", "ifcopenshell-turned", "ifcopenshell-over-box"];
left.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason));
for (const x of left.slice(0, listN)) console.log(`    #${x.id} ${x.reason}: here ${x.v.toPrecision(5)} IfcOpenShell ${x.q.toPrecision(5)}${x.qt != null ? ` (turned ${x.qt.toPrecision(5)}, ${x.unpaired} edges unpaired)` : ""} box ${x.box.toPrecision(4)} (${x.surfaces})`);
