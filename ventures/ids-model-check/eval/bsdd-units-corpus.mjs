// Every Real class property outside the IFC dictionary in a cache of bSDD
// answers (eval/bsdd-spec-corpus.mjs --cache DIR): what measure
// bsdd-units.mjs picks, why it picks none, and whether the property's own
// stated dimension agrees with its unit's QUDT dimension.
//   node eval/bsdd-units-corpus.mjs DIR
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { measureOf, unitsOf } from "../bsdd-units.mjs";
import { resources } from "../node.mjs";

const dir = process.argv[2];
const R = resources();
const U = R.bsddUnits;
const S = R.schemas.IFC4X3;
const IFC = /identifier\.buildingsmart\.org\/uri\/buildingsmart\/ifc\//i;
const seen = new Set();
const t = { real: 0, withUnit: 0, withDim: 0, measure: {}, why: {}, dims: { agree: 0, differ: [] }, scaleKnown: 0, dicts: new Set(), mappedDicts: new Set(), units: {} };
const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
for (const f of readdirSync(dir)) {
  let cls;
  try { cls = JSON.parse(JSON.parse(readFileSync(join(dir, f), "utf8")).body); } catch { continue; }
  if (!cls || !Array.isArray(cls.classProperties) || IFC.test(cls.dictionaryUri || "")) continue;
  for (const p of cls.classProperties) {
    if (String(p.dataType || "").toLowerCase() !== "real" || p.propertySet === "Attributes" || /^(Pset|Qto)_/.test(p.propertySet || "")) continue;
    if (/takes 'Ifc\w+' as value/.test(p.description || "") || IFC.test(p.propertyDictionaryUri || "")) continue;
    const k = `${cls.uri}\u0000${p.propertySet}\u0000${p.propertyCode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    t.real++;
    t.dicts.add(cls.dictionaryUri);
    if ((p.units && p.units.length) || (p.qudtCodes && p.qudtCodes.length)) t.withUnit++;
    if (p.dimension) t.withDim++;
    for (const u of p.units || []) bump(t.units, u);
    const m = measureOf(p, { units: U, schema: S });
    if (m.type) { bump(t.measure, m.type); t.mappedDicts.add(cls.dictionaryUri); if (m.scale !== null) t.scaleKnown++; }
    else bump(t.why, m.why.replace(/unit .*?: /, "unit: ").replace(/\(.*\)/, "(...)").replace(/unit \S+ is not in/, "unit X is not in").replace(/unit \S+ is not of/, "unit X is not of").replace(/dimension [-\d ]+$/, "dimension D"));
    const own = p.dimension && p.dimension.trim().split(/\s+/).map(Number);
    const { found } = unitsOf(p, U);
    if (own && found.length && own.some((x) => x !== 0)) {
      if (found.every((u) => u.dim.join(",") === own.join(","))) t.dims.agree++;
      else t.dims.differ.push(`${cls.code} ${p.propertyCode}: units ${(p.units || []).join(",")} (${found[0].dim.join(" ")}) vs dimension ${own.join(" ")}`);
    }
  }
}
const sorted = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);
const mapped = Object.values(t.measure).reduce((a, b) => a + b, 0);
console.log(`Real properties outside IFC (distinct class, set, code): ${t.real} in ${t.dicts.size} dictionaries`);
console.log(`  with a unit: ${t.withUnit}; with a dimension: ${t.withDim}`);
console.log(`  given an IFC measure: ${mapped} (${t.mappedDicts.size} dictionaries), ${t.scaleKnown} of them with one SI factor`);
console.log(`  kept as IFCREAL: ${t.real - mapped}`);
console.log("\nmeasures:");
for (const [k, v] of sorted(t.measure)) console.log(`  ${v}  ${k}`);
console.log("\nwhy no measure:");
for (const [k, v] of sorted(t.why)) console.log(`  ${v}  ${k}`);
console.log(`\nstated dimension vs the unit's QUDT dimension: ${t.dims.agree} agree, ${t.dims.differ.length} differ`);
for (const d of t.dims.differ.slice(0, 20)) console.log(`  ${d}`);
console.log("\nunits seen (top 30):");
for (const [k, v] of sorted(t.units).slice(0, 30)) console.log(`  ${v}  ${k}${U.codes[k] || U.units[k] ? "" : "  (not in bSDD's unit list)"}`);
