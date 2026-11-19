// Areas computed from geometry against the areas the exporting tool stored.
//
//   node eval/areas-vs-stored.mjs model.ifc [more.ifc ...] [--json out.json] [--list N]
//
// For every element whose quantity set stores an area this tool can compute
// (walls: GrossSideArea, NetSideArea, GrossFootprintArea, NetFootprintArea;
// slabs, plates, coverings, roofs: GrossArea, NetArea; columns, beams,
// members, piles: CrossSectionArea), the area is cut from the element's body
// by a plane (qto.mjs, computeAreas) and compared with the stored figure; a
// pair agrees within 2%. Each disagreement gets the first cause that explains
// it (qto.mjs, explainAreas).

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const listAt = args.indexOf("--list");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const listN = listAt >= 0 ? Number(args[listAt + 1]) : 8;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json" && args[i - 1] !== "--list");

const results = [];
const total = {};
for (const file of files) {
  const t0 = Date.now();
  const res = takeoff(parseStep(readFileSync(file)));
  const secs = (Date.now() - t0) / 1000;
  const byQty = {};
  const others = [];
  const rels = [];
  let notCut = 0;
  for (const r of res.rows) {
    const A = r.computed?.areas;
    if (A && (A.faceted || A.error)) {
      for (const [k, q] of Object.entries(r.stored)) if (q.kind === "area" && /^(gross|net)(side|footprint)?area$|^crosssectionarea$/i.test(k.replace(/\s+/g, ""))) { notCut++; break; }
    }
    for (const [k, c] of Object.entries(r.areaCheck || {})) {
      const q = `${r.ifcClass.replace(/StandardCase$/, "")}.${k}`;
      byQty[q] ??= { pairs: 0, agree: 0, reasons: {} };
      byQty[q].pairs++;
      total[k] ??= { pairs: 0, agree: 0, reasons: {} };
      total[k].pairs++;
      if (c.agree) { byQty[q].agree++; total[k].agree++; if (c.stored > 0) rels.push(Math.abs(c.rel)); continue; }
      byQty[q].reasons[c.reason] = (byQty[q].reasons[c.reason] || 0) + 1;
      total[k].reasons[c.reason] = (total[k].reasons[c.reason] || 0) + 1;
      if (c.reason === "unexplained") others.push({ id: r.id, ifcClass: r.ifcClass, name: r.name, qty: k, computed: c.computed, stored: c.stored, rel: c.rel, openings: r.computed.openings });
    }
  }
  rels.sort((a, b) => a - b);
  const med = rels.length ? rels[Math.floor(rels.length / 2)] : null;
  results.push({ file: basename(file), schema: res.schema, seconds: secs, byQty, medianAgreeRel: med, notCut, others: others.slice(0, 200) });
  console.log(`${basename(file)} (${res.schema}, ${secs.toFixed(1)} s): median |rel| of agreeing pairs ${med == null ? "-" : med.toExponential(1)}; elements storing an area but faceted (not cut): ${notCut}`);
  for (const [q, v] of Object.entries(byQty)) console.log(`  ${q}: ${v.agree} / ${v.pairs} agree${Object.keys(v.reasons).length ? "; " + Object.entries(v.reasons).map(([k, n]) => `${k} ${n}`).join(", ") : ""}`);
  for (const o of others.slice(0, listN)) console.log(`    #${o.id} ${o.ifcClass} ${o.qty} computed ${o.computed.toFixed(4)} stored ${o.stored.toFixed(4)} (${o.rel === Infinity ? "inf" : (o.rel * 100).toFixed(1) + "%"}) openings ${o.openings} ${o.name ?? ""}`);
}
console.log("TOTAL");
for (const [k, v] of Object.entries(total)) console.log(`  ${k}: ${v.agree} / ${v.pairs} agree${Object.keys(v.reasons).length ? "; " + Object.entries(v.reasons).map(([r, n]) => `${r} ${n}`).join(", ") : ""}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ results, total }, null, 1));
