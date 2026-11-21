#!/usr/bin/env node
// How close the quantities read from geometry (geometry-quantities.mjs) come
// to the ones exporters stored, per name and class, on models that store them.
//   node eval/qto-from-geometry.mjs MODEL.ifc ... [--json out.json]
// Agreement: within 2% and within 5% of the stored value (both in SI units).
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { quantitiesFromRows } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = {};
for (const f of args) {
  const t0 = Date.now();
  const { rows } = takeoff(parseStep(readFileSync(f)));
  const geo = quantitiesFromRows(rows);
  const stats = {};
  let offered = 0, elems = 0;
  for (const r of rows) {
    const m = geo.get(r.id);
    if (!m) continue;
    elems++;
    for (const [name, q] of m) {
      offered++;
      const fam = r.ifcType.replace(/STANDARDCASE$|ELEMENTEDCASE$/, "");
      const key = `${fam} ${name}`;
      const s = (stats[key] ||= { offered: 0, stored: 0, within2: 0, within5: 0, ratios: [] });
      s.offered++;
      const hit = Object.entries(r.stored).find(([k, v]) => k.toLowerCase() === name.toLowerCase() && v.kind === q.kind);
      if (!hit) continue;
      const sv = hit[1].value;
      if (!(sv > 0)) continue;
      s.stored++;
      const rel = Math.abs(q.value - sv) / sv;
      if (rel <= 0.02) s.within2++;
      if (rel <= 0.05) s.within5++;
      s.ratios.push(q.value / sv);
      if (rel > 0.02) {
        // ifc-quantity-takeoff's own reading of why the two differ
        const lk = name.toLowerCase();
        const reason = q.kind === "volume" ? r.check?.[lk.startsWith("net") ? "net" : "gross"]?.reason : Object.entries(r.areaCheck || {}).find(([k]) => k.toLowerCase() === lk)?.[1]?.reason;
        const why = reason || "unexplained";
        (s.reasons ||= {})[why] = (s.reasons[why] || 0) + 1;
      }
    }
  }
  for (const s of Object.values(stats)) { const a = s.ratios.sort((x, y) => x - y); s.medianRatio = a.length ? Number(a[a.length >> 1].toFixed(4)) : null; delete s.ratios; }
  const name = f.split("/").pop();
  out[name] = { elements: rows.length, elementsWithGeometryQuantities: elems, offered, seconds: (Date.now() - t0) / 1000, stats };
  console.log(`\n${name}: ${rows.length} elements, ${elems} with geometry quantities, ${offered} values, ${out[name].seconds} s`);
  console.log("class quantity | offered | stored | within 2% | within 5% | median computed/stored | causes of the rest (ifc-quantity-takeoff)");
  for (const [k, s] of Object.entries(stats).sort()) console.log(`${k} | ${s.offered} | ${s.stored} | ${s.within2} | ${s.within5} | ${s.medianRatio ?? "-"} | ${Object.entries(s.reasons || {}).map(([a, b]) => `${a} ${b}`).join(", ")}`);
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
