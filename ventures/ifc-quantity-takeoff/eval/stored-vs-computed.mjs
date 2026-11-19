// Computed volumes against the volumes the exporting tool stored, on real models.
//
//   node eval/stored-vs-computed.mjs model.ifc [more.ifc ...] [--json out.json] [--list N]
//
// For every element that has a stored GrossVolume or NetVolume and a volume
// computed from its body geometry, the pair agrees when the relative
// difference is within 2%. Each disagreement is put in the first class that
// explains it:
//   split      the same stored value sits on several elements with one Tag
//              (Revit's split-by-level export), and their computed volumes
//              sum to it within 2%: the stored figure is the whole element's
//   net-as-gross  the stored GrossVolume equals the computed net (openings
//              taken out): the exporter wrote net under the gross name
//   other      none of the above; listed with its class, notes and numbers.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, checkSummary } from "../qto.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const listAt = args.indexOf("--list");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const listN = listAt >= 0 ? Number(args[listAt + 1]) : 10;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json" && args[i - 1] !== "--list");
const TOL = 0.02;
const near = (a, b) => b !== 0 ? Math.abs(a - b) / Math.abs(b) <= TOL : Math.abs(a) < 1e-9;

const results = [];
for (const file of files) {
  const t0 = Date.now();
  const res = takeoff(parseStep(readFileSync(file)));
  const secs = (Date.now() - t0) / 1000;
  const s = checkSummary(res.rows);
  const cls = { gross: { agree: 0 }, net: { agree: 0 } };
  const others = [];
  for (const r of res.rows) {
    for (const w of ["gross", "net"]) {
      const c = r.check?.[w];
      if (!c) continue;
      const k = c.agree && !c.reason ? "agree" : c.agree ? `agree (${c.reason})` : c.reason;
      cls[w][k] = (cls[w][k] || 0) + 1;
      if (!c.agree && c.reason === "unexplained") others.push({ id: r.id, ifcClass: r.ifcClass, name: r.name, which: w, computed: c.computed, stored: c.stored, rel: c.rel, openings: r.computed.openings, faceted: r.computed.faceted, notes: r.computed.notes, netReason: r.computed.netReason });
    }
  }
  const otherByClass = {};
  for (const o of others) { const k = `${o.ifcClass} ${o.which}${o.faceted ? " (faceted)" : ""}`; otherByClass[k] = (otherByClass[k] || 0) + 1; }
  results.push({ file: basename(file), schema: res.schema, seconds: secs, summary: s, classes: cls, otherByClass, others });
  console.log(`${basename(file)} (${res.schema}, ${s.elements} elements, ${secs.toFixed(1)} s): volume computed ${s.computed}, not read ${s.notRead}, no body ${s.noBody}, net not computed ${s.netNotComputed}`);
  console.log(`  GrossVolume pairs ${s.grossPairs}: ${Object.entries(cls.gross).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`  NetVolume pairs ${s.netPairs}: ${Object.entries(cls.net).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const [k, v] of Object.entries(otherByClass).sort((a, b) => b[1] - a[1])) console.log(`    unexplained: ${v} x ${k}`);
  for (const o of others.slice(0, listN)) console.log(`    #${o.id} ${o.ifcClass} ${o.which} computed ${o.computed.toFixed(4)} stored ${o.stored.toFixed(4)} (${(o.rel * 100).toFixed(1)}%) openings ${o.openings}${o.notes.length ? " " + o.notes.join("; ") : ""}${o.netReason ? " net: " + o.netReason : ""}`);
  const reasons = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of reasons.slice(0, 6)) console.log(`    not read: ${v} x ${k}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results.map((r) => ({ ...r, others: r.others.slice(0, 200) })), null, 1));
