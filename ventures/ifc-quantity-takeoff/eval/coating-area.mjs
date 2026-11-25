// The coating column on public models: each steel part's whole surface, set
// beside the skin figure the author's tool stored where there is one.
//   node eval/coating-area.mjs a.ifc b.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, boq, coatingArea, rowQuantities } from "../qto.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = [];
const f = (v, d = 3) => (v == null ? "-" : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d));
console.log("model | steel parts | coated by geometry | of those net of holes | from a stored skin | none | stored skins beside geometry | agree within 2% | coating m2 | steel kg | m2 per tonne");
for (const file of args) {
  let t;
  try { t = takeoff(parseStep(readFileSync(file)), { geometry: true }); } catch (e) { console.log(`${basename(file)} | not read: ${e.message}`); continue; }
  const rows = t.rows.filter((r) => !r.isAssembly);
  const parts = rows.map((r) => ({ r, c: coatingArea(r) })).filter((x) => x.c);
  if (!parts.length) { console.log(`${basename(file)} | 0`); out.push({ model: basename(file), steelParts: 0 }); continue; }
  // the weight of the same steel parts, as the BoQ weighs them
  const kg = parts.reduce((a, { r }) => a + (rowQuantities(r).weight ?? 0), 0);
  const area = boq(t.rows, ["class"]).reduce((a, L) => a + L.coating, 0);
  const geo = parts.filter((x) => x.c.source === "computed"), st = parts.filter((x) => x.c.source === "stored"), none = parts.filter((x) => x.c.area == null);
  const both = parts.filter((x) => x.c.agree != null), agree = both.filter((x) => x.c.agree);
  const off = both.filter((x) => !x.c.agree).map(({ r, c }) => ({ id: r.id, class: r.ifcClass, name: r.name, stored: c.stored, storedName: c.storedName, computed: c.area, ratio: c.stored / c.area }));
  const byClass = {};
  for (const { r, c } of parts) { const b = (byClass[r.ifcClass] ??= { n: 0, area: 0, none: 0 }); b.n++; if (c.area != null) b.area += c.area; else b.none++; }
  const noneWhy = {};
  for (const { r } of none) { const k = r.computed?.status !== "ok" ? `body ${r.computed?.status ?? "none"}` : r.computed.areas?.faceted ? "faceted mesh" : r.computed.areas?.error ? "areas error" : "faces not summed"; noneWhy[k] = (noneWhy[k] || 0) + 1; }
  out.push({ model: basename(file), steelParts: parts.length, geometry: geo.length, netOfHoles: geo.filter((x) => x.c.holes).length, stored: st.length, none: none.length, noneWhy, both: both.length, agree: agree.length, coating: area, steelKg: kg, byClass, off });
  console.log([basename(file), parts.length, geo.length, geo.filter((x) => x.c.holes).length, st.length, none.length, both.length, agree.length, f(area, 2), f(kg, 1), kg > 0 ? f(area / (kg / 1000), 1) : "-"].join(" | "));
  console.log(`    by class: ${Object.entries(byClass).map(([k, b]) => `${k} ${b.n} (${f(b.area, 2)} m2${b.none ? `, ${b.none} none` : ""})`).join("; ")}`);
  const inside = parts.reduce((a, { c }) => a + (c.inside || 0), 0), hollow = parts.filter(({ c }) => c.inside > 0).length;
  out[out.length - 1].inside = inside; out[out.length - 1].hollow = hollow;
  if (hollow) console.log(`    inside of ${hollow} hollow sections: ${f(inside, 2)} m2 (not in the coating column)`);
  if (none.length) console.log(`    none: ${Object.entries(noneWhy).map(([k, n]) => `${n} ${k}`).join(", ")}`);
  for (const o of off) console.log(`    disagree #${o.id} ${o.class} ${JSON.stringify(o.name ?? "")}: stored ${o.storedName} ${f(o.stored, 5)}, faces ${f(o.computed, 5)} (x${f(o.ratio, 3)})`);
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1));
