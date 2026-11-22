#!/usr/bin/env node
// Qto_ NetWeight/GrossWeight as volume x density (weights.mjs) against the
// weights exporters stored. eval/member-weights-2026-11-22.md.
//   node eval/member-weights.mjs MODEL.ifc ... [--json out.json]
// Per model:
//   - every stored weight set against stored volume x the density learned
//     from all of the model's weights (does one density per material explain
//     them?);
//   - held out: the weights of elements with an odd STEP id hidden, densities
//     learned from the even ones, the odd ones predicted;
//   - a fixed standard table (steel 7,850, concrete 2,400, timber 500) for
//     comparison: what a tool that assumes densities would have written.
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { memberWeights, learnedDensities } from "../weights.mjs";

const TOL = 0.005;
const near = (a, b) => b > 0 && Math.abs(a / b - 1) <= TOL;
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const STANDARD = [[/steel|staal|stahl|s235|s355/i, 7850], [/concrete|beton/i, 2400], [/timber|wood|hout|holz/i, 500]];
const standardDensity = (m) => { for (const [re, d] of STANDARD) if (re.test(m || "")) return d; return null; };
const W = ["NetWeight", "GrossWeight"];
const storedW = (r, n) => { for (const [k, q] of Object.entries(r.stored || {})) if (q.kind === "weight" && k.replace(/\s+/g, "").toLowerCase() === n.toLowerCase() && q.value > 0) return q.value; return null; };
const withoutWeights = (r) => ({ ...r, stored: Object.fromEntries(Object.entries(r.stored || {}).filter(([, q]) => q.kind !== "weight")) });

const out = { files: {} };
const T = { stored: 0, offered: 0, within: 0, heldOut: 0, heldOffered: 0, heldWithin: 0, standardOffered: 0, standardWithin: 0 };
for (const f of args) {
  let model, rows;
  try { model = parseStep(readFileSync(f)); rows = takeoff(model).rows; } catch (e) { console.log(`${f}: not read (${e.message})`); continue; }
  const file = f.split("/").pop();
  const weighed = rows.filter((r) => W.some((n) => storedW(r, n)));
  if (!weighed.length) continue;
  const all = memberWeights(model, rows);
  const half = memberWeights(model, rows.map((r) => (r.id % 2 ? withoutWeights(r) : r)));
  const s = { stored: 0, offered: 0, within: 0, heldOut: 0, heldOffered: 0, heldWithin: 0, standardOffered: 0, standardWithin: 0, misses: [] };
  for (const r of weighed) {
    for (const n of W) {
      const st = storedW(r, n);
      if (!st) continue;
      s.stored++;
      const o = all.byId.get(r.id)?.[n]?.value;
      if (o != null) { s.offered++; if (near(o, st)) s.within++; else if (s.misses.length < 30) s.misses.push({ id: r.id, name: r.name, material: r.material, q: n, stored: st, offered: +o.toFixed(4) }); }
      if (r.id % 2) {
        s.heldOut++;
        const h = half.byId.get(r.id)?.[n]?.value;
        if (h != null) { s.heldOffered++; if (near(h, st)) s.heldWithin++; }
      }
      const sd = standardDensity(r.material);
      const vol = r.stored?.[n === "NetWeight" ? "NetVolume" : "GrossVolume"]?.value;
      if (sd && vol > 0) { s.standardOffered++; if (near(vol * sd, st)) s.standardWithin++; }
    }
  }
  const { materials } = learnedDensities(rows);
  out.files[file] = { ...s, materials, sources: Object.fromEntries(all.sources) };
  for (const k of Object.keys(T)) T[k] += s[k];
  console.log(`${file}: ${s.stored} stored weights; all learned: ${s.offered} offered, ${s.within} within 0.5%; held out ${s.heldOut}: ${s.heldOffered} offered, ${s.heldWithin} within; a standard table: ${s.standardOffered} offered, ${s.standardWithin} within`);
  for (const m of materials) console.log(`  ${m.material}: ${m.ratios} ratio(s), ${m.used ? `density ${m.density} kg/m3` : `none (${m.why})`}${m.used ? "" : `, ${m.min.toFixed(1)}-${m.max.toFixed(1)}`}`);
}
console.log(`\ntotal: ${T.stored} stored; ${T.offered} offered, ${T.within} within 0.5%; held out ${T.heldOut}: ${T.heldOffered} offered, ${T.heldWithin} within; standard table ${T.standardOffered} offered, ${T.standardWithin} within`);
out.total = T;
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
