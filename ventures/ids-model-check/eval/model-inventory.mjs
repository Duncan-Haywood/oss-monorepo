#!/usr/bin/env node
// What real models carry, read as the IDS editor reads them (inventory.mjs):
// per model, the object classes, the sets on them (standard for the class, a
// Pset_/Qto_ name the standard does not give that class, or a project's own),
// and how many standard-set properties the model writes in a data type other
// than the template's (a check asking the template's dataType fails those).
//
//   node eval/model-inventory.mjs DIR [DIR...]    (every .ifc/.ifcxml/.ifczip below)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Model } from "../ids.mjs";
import { resources, readModel } from "../node.mjs";
import { modelInventory } from "../inventory.mjs";
import { setsFor, propertiesOf } from "../editor.mjs";

const R = resources();
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ifc|ifcxml|ifczip)$/i.test(f) ? [p] : []; });
const files = process.argv.slice(2).flatMap(walk).sort();
const tot = { models: 0, failed: 0, objects: 0, carried: 0, std: 0, offStd: 0, own: 0, ownProps: 0, stdProps: 0, typeDiff: 0, typed: 0 };
const ownNames = new Map();
const rows = [];
for (const f of files) {
  let inv;
  const t0 = performance.now();
  try { inv = modelInventory(new Model((await readModel(f)).text, R.schemas), R.measureUnits); } catch (e) { tot.failed++; rows.push(`| ${f.split("/").slice(-2).join("/")} | failed: ${e.message.slice(0, 60)} |`); continue; }
  const ms = performance.now() - t0;
  tot.models++;
  const S = R.schemas[inv.schema], ps = R.psets[inv.schema], tm = inv.schema === "IFC2X3" ? R.typeMap : null;
  let std = 0, off = 0, own = 0, diff = 0, typed = 0, objects = 0;
  for (const c of inv.classes) {
    objects += c.count;
    const mine = setsFor(ps, S, c.cls, tm);
    for (const s of c.sets) {
      if (mine.includes(s.name)) {
        std++;
        const tpl = Object.fromEntries(propertiesOf(ps, S, s.name).map((p) => [p.name, p.dataTypes]));
        for (const p of s.props) if (tpl[p.name] && tpl[p.name].length && p.dataType) { typed++; if (!tpl[p.name].includes(p.dataType)) diff++; }
      } else if (/^(Pset|Qto)_/.test(s.name)) off++;
      else { own++; tot.ownProps += s.props.length; ownNames.set(s.name, (ownNames.get(s.name) || 0) + 1); }
    }
  }
  Object.assign(tot, { objects: tot.objects + objects, std: tot.std + std, offStd: tot.offStd + off, own: tot.own + own, typeDiff: tot.typeDiff + diff, typed: tot.typed + typed });
  rows.push(`| ${f.split("/").slice(-2).join("/")} | ${inv.schemaRaw} | ${objects} | ${inv.classes.length} | ${std} | ${off} | ${own} | ${diff} of ${typed} | ${(ms / 1000).toFixed(2)} |`);
}
console.log("| Model | Schema | Objects | Classes | Standard (class, set) pairs | Pset_/Qto_ not standard for the class | Own sets (class, set) | Standard props in another data type | Seconds |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
console.log(rows.join("\n"));
console.log(`\n${tot.models} models read, ${tot.failed} failed; ${tot.objects} objects; (class, set) pairs: ${tot.std} standard, ${tot.offStd} Pset_/Qto_ not standard for that class, ${tot.own} a project's own (${tot.ownProps} properties); standard-set properties written in a data type the template does not give: ${tot.typeDiff} of ${tot.typed}.`);
console.log("Most common own set names: " + [...ownNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, k]) => `${n} (${k})`).join(", "));
