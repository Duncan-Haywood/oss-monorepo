#!/usr/bin/env node
// Numeric and boolean attributes (OverallHeight, Elevation, Sizeable...) in the
// IDS editor, measured on real models: how many rows the editor now offers the
// model's range (or true/false) for, and whether a requirement built from that
// offer passes the model it came from.
//
// For every (class, attribute) whose attribute is a number or a boolean, read
// as the editor reads it (modelInventory + modelAttributes + valueChoices +
// modelValueOffer): a number row is written "if present, between the model's
// range" (outwardBound, as "Use the model's range" fills it), a boolean row
// whose objects all hold one value as "if present, exactly that". Each is
// checked against its own model with the checker. Rows with no empty objects
// should all pass. With --ids-out DIR, the requirements are also written one
// IDS per model, for eval/crosscheck_ifctester.py.
//
//   node eval/model-attr-ranges.mjs [--ids-out DIR] DIR-or-FILE [...]
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { Model } from "../ids.mjs";
import { resources, readModel, check } from "../node.mjs";
import { modelInventory } from "../inventory.mjs";
import { modelAttributes, modelValueOffer, valueChoices, commonAttributes, blankSpec, blankReq, stateToDoc, buildIds } from "../editor.mjs";

const R = resources();
const args = process.argv.slice(2);
const oi = args.indexOf("--ids-out");
const idsOut = oi >= 0 ? args.splice(oi, 2)[1] : null;
if (idsOut) mkdirSync(idsOut, { recursive: true });
const walk = (d) => !statSync(d).isDirectory() ? [d] : readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ifc|ifcxml|ifczip)$/i.test(f) ? [p] : []; });
const files = args.flatMap(walk).sort();

const blank = () => ({ rows: 0, offered: 0, withEmpty: 0, clean: 0, cleanPass: 0, dirty: 0, dirtyExact: 0 });
const tot = { number: blank(), bool: blank() };
const out = [], fails = [], examples = [];
for (const f of files) {
  const text = (await readModel(f)).text;
  const model = new Model(text, R.schemas);
  const inv = modelInventory(model, R.measureUnits);
  const S = R.schemas[inv.schema];
  const L = { S, psets: R.psets[inv.schema], tm: inv.schema === "IFC2X3" ? R.typeMap : null };
  const m = { number: blank(), bool: blank() };
  const specs = [];
  for (const c of inv.classes) {
    const editable = commonAttributes(S, [c.cls]);
    for (const a of modelAttributes(inv, [c.cls])) {
      if (!editable.includes(a.name)) continue;
      const r = { ...blankReq(), kind: "attribute", name: a.name, cardinality: "optional", oneOf: [] };
      const ch = valueChoices(L, [c.cls], r);
      if (ch.kind !== "number" && ch.kind !== "bool") continue;
      const t = m[ch.kind];
      t.rows++;
      const o = modelValueOffer(a, ch.kind, null);
      if (!o) continue;
      if (o.empty) t.withEmpty++;
      let row = null;
      if (ch.kind === "number" && o.rangeMin !== null) row = { ...r, mode: "range", min: o.rangeMin, max: o.rangeMax };
      if (ch.kind === "bool" && o.complete && o.values.length === 1) row = { ...r, mode: o.values[0][0] };
      if (!row) continue;
      t.offered++;
      if (ch.kind === "number" && examples.length < 14) examples.push(`${basename(f)} ${c.cls}.${a.name}: ${o.rangeMin} to ${o.rangeMax} (${a.count} objects${o.rangeMin !== String(o.min) || o.rangeMax !== String(o.max) ? `; held ${o.min} to ${o.max}` : ""})`);
      specs.push({ kind: ch.kind, empty: o.empty, spec: { ...blankSpec(), name: `${c.cls} ${a.name}`, cls: c.cls, withSub: false, reqs: [row] } });
    }
  }
  if (specs.length) {
    const ids = buildIds(stateToDoc({ title: `attribute ranges: ${basename(f)}`, schema: inv.schema, specs: specs.map((x) => x.spec) }, L), S);
    if (idsOut) writeFileSync(join(idsOut, basename(f).replace(/\.\w+$/, "") + ".ids"), ids);
    const res = check(ids, text);
    res.specs.forEach((s, i) => {
      const x = specs[i], t = m[x.kind];
      const failed = (s.failed || []).length;
      if (!x.empty) { t.clean++; if (s.status === "pass") t.cleanPass++; else if (fails.length < 12) fails.push(`${basename(f)}: ${s.name}: ${(s.failed || []).slice(0, 1).map((y) => y.why || (y.reasons || []).join("; ").slice(0, 200)).join("")}`); }
      else { t.dirty++; if (failed === x.empty) t.dirtyExact++; else if (fails.length < 12) fails.push(`${basename(f)}: ${s.name}: expected ${x.empty} failed, got ${failed}`); }
    });
  }
  for (const k of ["number", "bool"]) for (const q of Object.keys(m[k])) tot[k][q] += m[k][q];
  out.push(`| ${basename(f)} | ${inv.schema} | ${m.number.rows} | ${m.number.offered} | ${m.number.cleanPass} of ${m.number.clean} | ${m.number.dirtyExact} of ${m.number.dirty} | ${m.bool.rows} | ${m.bool.offered} | ${m.bool.cleanPass} of ${m.bool.clean} |`);
}
console.log("| Model | Schema | Numeric attribute rows | Range offered | Pass (no empty objects) | Fail on exactly the empty ones | Boolean rows | One value, offered | Pass |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
console.log(out.join("\n"));
for (const [k, t] of Object.entries(tot)) console.log(`\n${k}: ${t.rows} rows, ${t.offered} offered; ${t.withEmpty} rows with empty objects; built from offers: ${t.cleanPass} of ${t.clean} pass, ${t.dirtyExact} of ${t.dirty} fail on exactly the empty objects`);
if (examples.length) console.log("\nExamples:\n  " + examples.join("\n  "));
if (fails.length) console.log("\nDisagreements:\n  " + fails.join("\n  "));
process.exitCode = Object.values(tot).every((t) => t.cleanPass === t.clean && t.dirtyExact === t.dirty) ? 0 : 1;
