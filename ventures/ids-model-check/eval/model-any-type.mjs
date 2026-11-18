#!/usr/bin/env node
// Standard-set properties a real model writes in a data type the template does
// not give (Revit's Pset_*Common.Reference as IFCLABEL, not IFC2X3's
// IFCIDENTIFIER), and what the IDS editor's "Accept any data type" offer
// (editor.mjs untypeRow) does to a check of them.
//
// For every (class, standard set, property) a model carries in another type,
// read as the editor reads it (modelInventory + modelSets), three IDS files are
// written, one specification per triple, exact class:
//   template.ids  the row as the editor writes it today: the template's
//                 dataType, presence required
//   anytype.ids   the same row after untypeRow: no dataType, presence required
//   values.ids    the untyped row asking for the model's own values ("Allow
//                 exactly these values", one of), where the editor offers them
//                 (not on a real-number model type: checkers read those apart)
// Each is audited (template errors, warnings) and checked against the same
// model; IfcTester's verdicts come from eval/crosscheck_ifctester.py on the
// files written to OUT.
//
//   node eval/model-any-type.mjs OUT DIR [DIR...]
import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { Model, parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources, readModel, check } from "../node.mjs";
import { modelInventory } from "../inventory.mjs";
import { setsFor, propertiesOf, modelSets, modelValueOffer, blankSpec, blankReq, stateToDoc, buildIds, untypeRow, typeRow } from "../editor.mjs";

const R = resources();
const [out, ...dirs] = process.argv.slice(2);
if (!out || !dirs.length) { console.error("usage: node eval/model-any-type.mjs OUT DIR [DIR...]"); process.exit(2); }
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ifc|ifcxml|ifczip)$/i.test(f) ? [p] : []; });
const files = dirs.flatMap(walk).sort();
mkdirSync(out, { recursive: true });

const rows = [], kinds = new Map();
const tot = { triples: 0, objects: 0, back: 0 };
const sum = {};
for (const f of files) {
  const text = (await readModel(f)).text;
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const S = R.schemas[inv.schema], ps = R.psets[inv.schema], tm = inv.schema === "IFC2X3" ? R.typeMap : null;
  const L = { S, psets: ps, tm };
  const specs = { template: [], anytype: [], values: [] };
  let objects = 0;
  for (const c of inv.classes) {
    const std = setsFor(ps, S, c.cls, tm);
    for (const set of modelSets(inv, [c.cls], std)) {
      if (!set.standard) continue;
      for (const p of set.props) {
        const t = propertiesOf(ps, S, set.name).find((x) => x.name === p.name);
        if (!t || !t.dataTypes.length || !p.dataType || t.dataTypes.includes(p.dataType)) continue;
        const row = { ...blankReq(), set: set.name, name: p.name };
        const u = untypeRow(L, row, p.dataType);
        if (!u || u.dropped) throw new Error(`untypeRow refused ${set.name}.${p.name}`);
        // typeRow turns it back into the template's row.
        const back = typeRow(L, u.row);
        if (back && !back.row.untyped && !back.dropped) tot.back++;
        const name = `${c.cls} ${set.name}.${p.name} (model ${p.dataType}, template ${t.dataTypes.join("/")})`;
        const spec = (r) => ({ ...blankSpec(), name, cls: c.cls, withSub: false, reqs: [r] });
        specs.template.push(spec(row));
        specs.anytype.push(spec(u.row));
        const o = modelValueOffer(p, "text", null);
        // The page offers no values on a real-number model type (untypeRow, `real`).
        if (o && o.oneOf && !u.real) specs.values.push(spec({ ...u.row, mode: "oneOf", oneOf: o.oneOf }));
        kinds.set(`${p.dataType} for ${t.dataTypes.join("/")}`, (kinds.get(`${p.dataType} for ${t.dataTypes.join("/")}`) || 0) + 1);
        tot.triples++;
        objects += p.count; tot.objects += p.count;
      }
    }
  }
  if (!specs.template.length) { rows.push(`| ${basename(f)} | 0 | - | - | - |`); continue; }
  const cells = [];
  for (const k of ["template", "anytype", "values"]) {
    if (!specs[k].length) { cells.push("-"); continue; }
    const ids = buildIds(stateToDoc({ title: `${basename(f)} ${k}`, schema: inv.schema, specs: specs[k] }, L), S);
    writeFileSync(join(out, `${basename(f, ".ifc")}.${k}.ids`), ids);
    const issues = auditIds(parseIds(ids), { schemas: { [inv.schema]: S }, typeMap: R.typeMap, psets: R.psets });
    const errs = issues.filter((i) => i.level === "error").length, warns = issues.filter((i) => i.level === "warning").length;
    const r = check(ids, text);
    const pass = r.specs.filter((s) => s.status === "pass").length;
    const failing = r.specs.reduce((n, s) => n + (s.failed || []).length, 0);
    const applicable = r.specs.reduce((n, s) => n + (s.applicable || 0), 0);
    const a = (sum[k] ||= { specs: 0, pass: 0, failing: 0, applicable: 0, errs: 0, warns: 0 });
    a.specs += r.specs.length; a.pass += pass; a.failing += failing; a.applicable += applicable; a.errs += errs; a.warns += warns;
    cells.push(`${pass} of ${r.specs.length} pass, ${failing} of ${applicable} objects fail; audit ${errs} errors, ${warns} warnings`);
  }
  rows.push(`| ${basename(f)} | ${specs.template.length} (${objects} objects) | ${cells.join(" | ")} |`);
}
console.log("| Model | Properties in another type | Template dataType (today) | No dataType (Accept any data type) | No dataType, the model's values |");
console.log("| --- | ---: | --- | --- | --- |");
console.log(rows.join("\n"));
console.log(`\n${tot.triples} (class, set, property) triples on ${tot.objects} objects; typeRow turns ${tot.back} of ${tot.triples} back to the template's dataType.`);
if (sum.template && sum.anytype) console.log(`objects failing only for their data type (template minus no dataType): ${sum.template.failing - sum.anytype.failing}; the rest lack the set, the property or a value`);
for (const [k, a] of Object.entries(sum)) console.log(`${k}: ${a.pass} of ${a.specs} specifications pass, ${a.failing} of ${a.applicable} applicable objects fail; audit ${a.errs} errors, ${a.warns} warnings`);
console.log("\nModel type for the template's:\n  " + [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join("\n  "));
