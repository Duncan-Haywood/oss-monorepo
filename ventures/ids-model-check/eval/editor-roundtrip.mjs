// Does every choice the IDS editor offers write an IDS the audit accepts?
// For each schema, every class the editor offers, every standard set it
// offers for that class and every property of the set: one specification
// requiring the property with the template's dataType, and one more with a
// value of the right kind (an enumeration member, true, a number range or a
// text value). Parses each IDS back, audits it, and counts errors and
// warnings by code. Usage: node eval/editor-roundtrip.mjs [--json out.json]
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources } from "../node.mjs";
import { classesWithSets, setsFor, propertiesOf, buildIds, entityFacet } from "../editor.mjs";
import { writeFileSync } from "node:fs";

const { schemas, typeMap, psets } = resources();
// The page offers no value restriction for a property whose template gives
// no single dataType (bounded, table, list or reference values): presence only.
const sample = (p, S) => {
  if (!p.dataType) return null;
  if (p.enum) return { oneOf: [p.enum[0]] };
  const prim = p.dataType ? S.prim(p.dataType) : "string";
  if (prim === "boolean" || prim === "logical") return { equals: "true" };
  if (prim === "double" || prim === "integer") return { min: "0" };
  if (prim === "string") return { pattern: ".+" };
  return null;
};
const out = {};
const t0 = Date.now();
for (const id of ["IFC2X3", "IFC4", "IFC4X3"]) {
  const S = schemas[id];
  const tm = id === "IFC2X3" ? typeMap : null;
  const classes = classesWithSets(psets[id], S, tm);
  const r = { classes: classes.length, specs: 0, presenceOnly: 0, invalidSpecs: 0, errors: {}, warnings: {}, examples: [] };
  for (const cls of classes) {
    const specs = [];
    for (const set of setsFor(psets[id], S, cls, tm)) {
      for (const p of propertiesOf(psets[id], S, set)) {
        const app = [entityFacet(S, cls)];
        specs.push({ name: `${cls} ${set}.${p.name}`, applicability: app, requirements: [{ kind: "property", set, name: p.name, dataType: p.dataType }] });
        if (!p.dataType) r.presenceOnly++;
        const v = sample(p, S);
        if (v) specs.push({ name: `${cls} ${set}.${p.name} value`, applicability: app, requirements: [{ kind: "property", set, name: p.name, dataType: p.dataType, value: v }] });
      }
    }
    if (!specs.length) continue;
    const ids = parseIds(buildIds({ title: cls, schema: id, specs }, S));
    const issues = auditIds(ids, { schemas: { [id]: S }, typeMap, psets });
    r.specs += specs.length;
    const bad = new Set();
    for (const x of issues) {
      const bucket = x.level === "error" ? r.errors : r.warnings;
      bucket[x.code] = (bucket[x.code] || 0) + 1;
      if (x.level === "error") bad.add(x.spec);
      if (r.examples.length < 12) r.examples.push(`${x.level} ${x.code}: ${x.specName}: ${x.message}`);
    }
    r.invalidSpecs += bad.size;
  }
  out[id] = r;
  console.log(`${id}: ${r.classes} classes offered, ${r.specs} specifications written (${r.presenceOnly} properties with no template dataType, presence only), ${r.invalidSpecs} invalid; errors ${JSON.stringify(r.errors)}; warnings ${JSON.stringify(r.warnings)}`);
  for (const e of r.examples) console.log("  " + e);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
const j = process.argv.indexOf("--json");
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 2));
