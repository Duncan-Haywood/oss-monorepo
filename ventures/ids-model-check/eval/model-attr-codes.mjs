#!/usr/bin/env node
// What the IDS editor offers from a model's attribute values and
// classification codes, measured on real models, and whether a requirement
// built from an offer passes that model (as eval/model-values.mjs does for
// property values).
//
// For every (class, attribute) and (class, classification system) a model
// carries, read as the editor reads it (modelInventory + modelAttributes /
// modelCodes + valueChoices + modelValueOffer):
//   - is the full list known, is "Allow exactly these values" offered,
//   - how many objects carry it with no value (an empty attribute, a
//     classification with no code), which any value check fails.
// Every offer is written as an IDS requirement ("if present, must match" for
// an attribute, "must have" for a classification in its system, exact class)
// and checked against the same model with the checker. Offers with no empty
// objects should all pass; the rest should fail on exactly the empty ones.
//
//   node eval/model-attr-codes.mjs DIR [DIR...]    (every .ifc/.ifcxml/.ifczip below)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Model } from "../ids.mjs";
import { resources, readModel, check } from "../node.mjs";
import { modelInventory } from "../inventory.mjs";
import { modelAttributes, modelCodes, modelValueOffer, valueChoices, commonAttributes, blankSpec, blankReq, stateToDoc, buildIds } from "../editor.mjs";

const R = resources();
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ifc|ifcxml|ifczip)$/i.test(f) ? [p] : []; });
const files = process.argv.slice(2).flatMap(walk).sort();

const blank = () => ({ rows: 0, withValues: 0, complete: 0, oneOf: 0, withEmpty: 0, emptyObjects: 0, clean: 0, cleanPass: 0, dirty: 0, dirtyExact: 0 });
const tot = { attr: blank(), code: blank() };
const rows = [], fails = [], examples = [];
for (const f of files) {
  const text = (await readModel(f)).text;
  const model = new Model(text, R.schemas);
  const inv = modelInventory(model, R.measureUnits);
  const S = R.schemas[inv.schema];
  const L = { S, psets: R.psets[inv.schema], tm: inv.schema === "IFC2X3" ? R.typeMap : null };
  const m = { attr: blank(), code: blank() };
  const specs = [];
  for (const c of inv.classes) {
    const editable = commonAttributes(S, [c.cls]);
    for (const a of modelAttributes(inv, [c.cls])) {
      if (!editable.includes(a.name)) continue;
      m.attr.rows++;
      const r = { ...blankReq(), kind: "attribute", name: a.name, cardinality: "optional" };
      const ch = valueChoices(L, [c.cls], r);
      const o = modelValueOffer(a, ch.kind, ch.enumVals);
      if (!o) continue;
      m.attr.withValues++;
      if (o.complete) m.attr.complete++;
      if (o.empty) { m.attr.withEmpty++; m.attr.emptyObjects += o.empty; }
      if (!o.oneOf) continue;
      m.attr.oneOf++;
      if (examples.length < 10 && a.name !== "Name" && o.oneOf.length > 1) examples.push(`${c.cls}.${a.name}: ${o.oneOf.slice(0, 4).join(", ")}${o.oneOf.length > 4 ? ", ..." : ""}`);
      specs.push({ kind: "attr", empty: o.empty, spec: { ...blankSpec(), name: `${c.cls} ${a.name}`, cls: c.cls, withSub: false, reqs: [{ ...r, mode: "oneOf", oneOf: o.oneOf }] } });
    }
    for (const k of modelCodes(inv, [c.cls])) {
      m.code.rows++;
      const r = { ...blankReq(), kind: "classification", system: k.system, cardinality: "required" };
      const o = modelValueOffer(k, "text", null);
      if (!o) continue;
      m.code.withValues++;
      if (o.complete) m.code.complete++;
      if (o.empty) { m.code.withEmpty++; m.code.emptyObjects += o.empty; }
      if (!o.oneOf) continue;
      m.code.oneOf++;
      // "must have" fails objects outside the system too: count those as expected.
      specs.push({ kind: "code", empty: o.empty + (c.count - k.count), spec: { ...blankSpec(), name: `${c.cls} ${k.system}`, cls: c.cls, withSub: false, reqs: [{ ...r, mode: "oneOf", oneOf: o.oneOf }] } });
    }
  }
  if (specs.length) {
    const ids = buildIds(stateToDoc({ title: "offers", schema: inv.schema, specs: specs.map((x) => x.spec) }, L), S);
    const res = check(ids, text);
    res.specs.forEach((s, i) => {
      const x = specs[i], t = m[x.kind];
      const failed = (s.failed || []).length;
      if (!x.empty) { t.clean++; if (s.status === "pass") t.cleanPass++; else if (fails.length < 12) fails.push(`${f.split("/").pop()}: ${s.name}: ${(s.failed || []).slice(0, 1).map((y) => y.why || (y.reasons || []).join("; ").slice(0, 200)).join("")}`); }
      else { t.dirty++; if (failed === x.empty) t.dirtyExact++; else if (fails.length < 12) fails.push(`${f.split("/").pop()}: ${s.name}: expected ${x.empty} failed, got ${failed}`); }
    });
  }
  for (const k of ["attr", "code"]) for (const q of Object.keys(m[k])) tot[k][q] += m[k][q];
  rows.push(`| ${f.split("/").slice(-2).join("/")} | ${inv.schema} | ${m.attr.rows} | ${m.attr.oneOf} | ${m.attr.cleanPass} of ${m.attr.clean} | ${m.attr.dirtyExact} of ${m.attr.dirty} | ${m.code.rows} | ${m.code.oneOf} | ${m.code.cleanPass} of ${m.code.clean} | ${m.code.dirtyExact} of ${m.code.dirty} |`);
}
console.log("| Model | Schema | Attribute rows | One-of offered | Pass (no empty objects) | Fail on exactly the empty ones | Class x system rows | One-of offered | Pass (all coded) | Fail on exactly the uncoded |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
console.log(rows.join("\n"));
for (const [k, t] of Object.entries(tot)) console.log(`\n${k}: ${t.rows} rows, ${t.withValues} with values, ${t.complete} full list known, one-of offered ${t.oneOf}; ${t.withEmpty} rows with ${t.emptyObjects} objects carrying no value; built from offers: ${t.cleanPass} of ${t.clean} pass (no empty objects), ${t.dirtyExact} of ${t.dirty} fail on exactly the objects the row warns about`);
if (examples.length) console.log("\nExamples:\n  " + examples.join("\n  "));
if (fails.length) console.log("\nDisagreements:\n  " + fails.join("\n  "));
process.exitCode = tot.attr.cleanPass === tot.attr.clean && tot.code.cleanPass === tot.code.clean && tot.attr.dirtyExact === tot.attr.dirty && tot.code.dirtyExact === tot.code.dirty ? 0 : 1;
