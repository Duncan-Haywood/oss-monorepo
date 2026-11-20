// Volumes read here against IfcOpenShell's, element by element.
//
//   node eval/elements-vs-ifcopenshell.mjs model.ifc ios.json [--list N]
//
// ios.json comes from eval/ifcopenshell-volumes.py (an independent kernel:
// OpenCASCADE booleans and its own tessellation). Every element both read is
// compared on gross volume (no openings) and net volume (openings taken
// out); a pair agrees within 1%. Elements are split by what the reading
// needed: an IfcAdvancedBrep in the body or in an opening, or a faceted body
// or opening that had to be taken as polyhedra (geom.mjs, asTerms) for a
// boolean or an opening; the rest are "other".

import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const listAt = args.indexOf("--list");
const listN = listAt >= 0 ? Number(args[listAt + 1]) : 10;
const [file, refFile] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--list");
const text = readFileSync(file);
const model = parseStep(text);
const ref = JSON.parse(readFileSync(refFile, "utf8"));
const res = takeoff(model);

// which elements have one of some body types anywhere under their body
const E = model.entities;
const ADVANCED = new Set(["IFCADVANCEDBREP", "IFCADVANCEDBREPWITHVOIDS"]);
const FACETED = new Set(["IFCFACETEDBREP", "IFCFACETEDBREPWITHVOIDS", "IFCPOLYGONALFACESET", "IFCTRIANGULATEDFACESET", "IFCSHELLBASEDSURFACEMODEL", "IFCFACEBASEDSURFACEMODEL"]);
const STOP = new Set(["IFCCLOSEDSHELL", "IFCOPENSHELL", "IFCADVANCEDFACE", "IFCFACE", "IFCCARTESIANPOINTLIST3D", "IFCLOCALPLACEMENT", "IFCAXIS2PLACEMENT3D", "IFCCARTESIANTRANSFORMATIONOPERATOR3D"]);
const has = (types, id, seen = new Set()) => {
  if (id == null || seen.has(id)) return false;
  seen.add(id);
  const e = E.get(id);
  if (!e) return false;
  if (types.has(e.type)) return true;
  if (STOP.has(e.type) || FACETED.has(e.type) || ADVANCED.has(e.type)) return false;
  const walk = (v) => (Array.isArray(v) ? v.some(walk) : v && typeof v === "object" && "ref" in v ? has(types, v.ref, seen) : false);
  return e.args.some(walk);
};
// a faceted solid inside a boolean (its second operand needs it as polyhedra)
const facetedInBoolean = (id, seen = new Set()) => {
  if (id == null || seen.has(id)) return false;
  seen.add(id);
  const e = E.get(id);
  if (!e || STOP.has(e.type) || FACETED.has(e.type) || ADVANCED.has(e.type)) return false;
  if (e.type === "IFCBOOLEANRESULT" || e.type === "IFCBOOLEANCLIPPINGRESULT") return has(FACETED, e.args[2]?.ref) || facetedInBoolean(e.args[1]?.ref, seen);
  const walk = (v) => (Array.isArray(v) ? v.some(walk) : v && typeof v === "object" && "ref" in v ? facetedInBoolean(v.ref, seen) : false);
  return e.args.some(walk);
};
const voidsOf = new Map();
for (const e of E.values()) if (e.type === "IFCRELVOIDSELEMENT") {
  const a = e.args[4].ref, o = e.args[5].ref;
  if (!voidsOf.has(a)) voidsOf.set(a, []);
  voidsOf.get(a).push(o);
}

const groups = {};
const misses = [];
for (const r of res.rows) {
  const c = r.computed;
  const q = ref[r.globalId];
  const el = E.get(r.id);
  const body = el.args[6]?.ref, opens = (voidsOf.get(r.id) || []).map((o) => E.get(o).args[6]?.ref);
  const adv = has(ADVANCED, body) ? "advanced brep body"
    : opens.some((o) => has(ADVANCED, o)) ? "advanced brep opening"
    : facetedInBoolean(body) ? "faceted solid in a boolean"
    : opens.length && (has(FACETED, body) || opens.some((o) => has(FACETED, o))) ? "faceted body or opening, with openings"
    : "other";
  const g = (groups[adv] ??= { elements: 0, read: 0, notRead: 0, iosMissing: 0, gross: [0, 0], net: [0, 0] });
  g.elements++;
  if (!c || c.status !== "ok") { g.notRead++; continue; }
  g.read++;
  if (!q) { g.iosMissing++; continue; }
  for (const k of ["gross", "net"]) {
    if (c[k] == null || q[k] == null) continue;
    const rel = q[k] > 1e-9 ? (c[k] - q[k]) / q[k] : c[k] - q[k];
    const ok = Math.abs(rel) <= 0.01 || Math.abs(c[k] - q[k]) < 1e-6;
    g[k][0] += ok ? 1 : 0;
    g[k][1]++;
    if (!ok) misses.push({ adv, k, id: r.id, cls: r.ifcClass, here: c[k], ios: q[k], rel });
  }
}
console.log(`${file.split("/").pop()}: ${res.rows.length} elements`);
for (const [k, g] of Object.entries(groups)) {
  console.log(`  ${k}: ${g.elements} elements, read ${g.read}, not read ${g.notRead}, not built by IfcOpenShell ${g.iosMissing}; gross agree ${g.gross[0]} / ${g.gross[1]}, net agree ${g.net[0]} / ${g.net[1]}`);
}
misses.sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel));
for (const m of misses.slice(0, listN)) console.log(`    ${m.adv} ${m.k} #${m.id} ${m.cls} here ${m.here.toFixed(4)} IfcOpenShell ${m.ios.toFixed(4)} (${(100 * m.rel).toFixed(2)}%)`);
