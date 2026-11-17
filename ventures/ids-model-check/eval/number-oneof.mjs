#!/usr/bin/env node
// "One of" rows on numbers in the IDS editor, measured on real models.
//
// For every (class, standard or own set, property) and every (class,
// attribute) a model holds as a number, read as the editor reads it
// (modelInventory + modelSets / modelAttributes + valueChoices +
// modelValueOffer), where the model holds at most NUMBER_ONEOF_MAX different
// values, three "if present, must be one of" requirements are written:
//   asWritten  the model's values as it holds them ("Allow exactly these values")
//   display    the same values to 6 significant digits, as an author copying
//              them from a viewer would type them (only when that changes one)
//   dropOne    the list without its commonest value (every exact value
//              tallied as it at 12 digits), which should fail exactly the
//              objects holding a value no remaining one is within IDS's
//              tolerance of (only when there are two values or more)
// Each is checked with this checker; the IDS is written one file per model for
// eval/crosscheck_ifctester.py, and reopened in the editor (every row
// editable, written back byte for byte).
//
//   node eval/number-oneof.mjs [--ids-out DIR] DIR-or-FILE [...]
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { Model, parseIds } from "../ids.mjs";
import { resources, readModel, check } from "../node.mjs";
import { modelInventory } from "../inventory.mjs";
import { setsFor, propertiesOf, modelSets, modelAttributes, modelValueOffer, valueChoices, commonAttributes, ownSetName, blankSpec, blankReq, stateToDoc, buildIds, importIds, NUMBER_ONEOF_MAX } from "../editor.mjs";

const R = resources();
const args = process.argv.slice(2);
const oi = args.indexOf("--ids-out");
const idsOut = oi >= 0 ? args.splice(oi, 2)[1] : null;
if (idsOut) mkdirSync(idsOut, { recursive: true });
const walk = (d) => !statSync(d).isDirectory() ? [d] : readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ifc|ifcxml|ifczip)$/i.test(f) ? [p] : []; });
const files = args.flatMap(walk).sort();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const six = (v) => String(Number(Number(v).toPrecision(6)));

const KINDS = ["asWritten", "display", "dropOne"];
const tot = { rows: 0, offered: 0, tooMany: 0, integer: 0, real: 0, reopenedRows: 0, kept: 0, identical: 0, models: 0 };
for (const k of KINDS) tot[k] = { n: 0, ok: 0 };
const out = [], notes = [];
for (const f of files) {
  const text = (await readModel(f)).text;
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const S = R.schemas[inv.schema];
  const L = loadFor(inv.schema);
  const specs = [];
  const m = { rows: 0, offered: 0, asWritten: [0, 0], display: [0, 0], dropOne: [0, 0] };
  const add = (c, label, r, o, integer) => {
    m.offered++; integer ? tot.integer++ : tot.real++;
    const vals = o.oneOf;
    const held = o.values.reduce((t, [, n]) => t + n, 0);
    specs.push({ kind: "asWritten", expect: 0, spec: { ...blankSpec(), name: `${c} ${label}: one of ${vals.length}, as written`, cls: c, withSub: false, reqs: [{ ...r, mode: "oneOf", oneOf: vals }] } });
    const shown = [...new Set(vals.map(six))];
    if (!integer && shown.some((v, i) => v !== vals[i]) && shown.length === vals.length) {
      // This checker's tolerance (|a - b| <= |b| x 1e-6 + 1e-6) passes a value
      // within it; one that rounds further off fails, so count what to expect.
      const near = (v) => shown.some((w) => Math.abs(Number(v) - Number(w)) <= (Math.abs(Number(w)) * 1e-6 + 1e-6) * (1 + 1e-9));
      const expect = o.values.filter(([v]) => !near(v)).reduce((t, [, n]) => t + n, 0);
      specs.push({ kind: "display", expect, spec: { ...blankSpec(), name: `${c} ${label}: one of ${vals.length}, to 6 digits`, cls: c, withSub: false, reqs: [{ ...r, mode: "oneOf", oneOf: shown }] } });
    }
    // (Only when the model holds two values or more at 12 digits: several
    // exact values can share one, Revit's 2.75 and 2.7500000000000004.)
    if (o.values.length > 1) {
      const [top] = [...o.values].sort((a, b) => b[1] - a[1])[0];
      const rest = vals.filter((v) => String(Number(Number(v).toPrecision(12))) !== top); // the exact values tallied as `top`
      // Objects holding a value no listed one is within tolerance of (Revit's
      // 9.9999989437 next to 10 matches 10, so dropping 10 fails neither).
      const near = (v) => rest.some((w) => integer ? Number(v) === Number(w) : Math.abs(Number(v) - Number(w)) <= (Math.abs(Number(w)) * 1e-6 + 1e-6) * (1 + 1e-9));
      const n = o.values.filter(([v]) => !near(v)).reduce((t, [, k]) => t + k, 0);
      specs.push({ kind: "dropOne", expect: n, spec: { ...blankSpec(), name: `${c} ${label}: one of ${rest.length}, without ${top}`, cls: c, withSub: false, reqs: [{ ...r, mode: "oneOf", oneOf: rest }] } });
    }
    if (held !== o.values.reduce((t, [, k]) => t + k, 0)) notes.push(`${basename(f)} ${c} ${label}: tally mismatch`);
  };
  for (const c of inv.classes) {
    const std = setsFor(L.psets, S, c.cls, L.tm);
    for (const set of modelSets(inv, [c.cls], std)) {
      const own = !set.standard && ownSetName(set.name);
      if (!set.standard && !own) continue;
      for (const p of set.props) {
        const r = { ...blankReq(), kind: "property", custom: !set.standard, set: set.name, name: p.name, dataType: set.standard ? "" : p.dataType || "", cardinality: "optional", oneOf: [] };
        if (set.standard) {
          const t = propertiesOf(L.psets, S, set.name).find((x) => x.name === p.name);
          if (!t || !t.dataType || (p.dataType && p.dataType !== t.dataType)) continue;
        }
        const ch = valueChoices(L, [c.cls], r);
        if (ch.kind !== "number") continue;
        m.rows++;
        const o = modelValueOffer(p, "number", ch.enumVals);
        if (!o || !o.values.length || o.empty) continue;
        if (!o.oneOf) { if (o.complete) tot.tooMany++; continue; }
        add(c.cls, `${set.name}.${p.name}`, r, o, ch.integer);
      }
    }
    const editable = commonAttributes(S, [c.cls]);
    for (const a of modelAttributes(inv, [c.cls])) {
      if (!editable.includes(a.name)) continue;
      const r = { ...blankReq(), kind: "attribute", name: a.name, cardinality: "optional", oneOf: [] };
      const ch = valueChoices(L, [c.cls], r);
      if (ch.kind !== "number") continue;
      m.rows++;
      const o = modelValueOffer(a, "number", null);
      if (!o || !o.values.length || o.empty) continue;
      if (!o.oneOf) { if (o.complete) tot.tooMany++; continue; }
      add(c.cls, a.name, r, o, ch.integer);
    }
  }
  let reopened = "-";
  if (specs.length) {
    const ids = buildIds(stateToDoc({ title: `number one-of rows: ${basename(f)}`, schema: inv.schema, specs: specs.map((x) => x.spec) }, L), S);
    if (idsOut) writeFileSync(join(idsOut, basename(f).replace(/\.\w+$/, "") + ".ids"), ids);
    const res = check(ids, text);
    res.specs.forEach((s, i) => {
      const x = specs[i], failed = (s.failed || []).length;
      m[x.kind][1]++; tot[x.kind].n++;
      if (failed === x.expect) { m[x.kind][0]++; tot[x.kind].ok++; }
      else if (notes.length < 20) notes.push(`${basename(f)}: ${s.name}: expected ${x.expect} failing, got ${failed}`);
    });
    const imp = importIds(parseIds(ids), loadFor);
    const back = buildIds(stateToDoc(imp.state, L), S);
    tot.reopenedRows += imp.rows - specs.length; tot.kept += imp.kept; if (back === ids) tot.identical++;
    reopened = `${imp.rows - specs.length} of ${specs.length}${back === ids ? ", identical" : ", DIFFERENT"}`;
  }
  tot.models++; tot.rows += m.rows; tot.offered += m.offered;
  out.push(`| ${basename(f)} | ${inv.schema} | ${m.rows} | ${m.offered} | ${m.asWritten[0]} of ${m.asWritten[1]} | ${m.display[0]} of ${m.display[1]} | ${m.dropOne[0]} of ${m.dropOne[1]} | ${reopened} |`);
}
console.log(`| Model | Schema | Number rows | One-of offered (<= ${NUMBER_ONEOF_MAX} values) | As written: pass | To 6 digits: as expected | Without the commonest: fails exactly its objects | Reopened: rows editable |`);
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
console.log(out.join("\n"));
console.log(`\n${tot.models} models: ${tot.rows} number rows, one-of offered on ${tot.offered} (${tot.integer} integer, ${tot.real} real); full list known but over ${NUMBER_ONEOF_MAX} values: ${tot.tooMany}`);
for (const k of KINDS) console.log(`${k}: ${tot[k].ok} of ${tot[k].n} as expected`);
console.log(`reopened: ${tot.reopenedRows} rows editable, ${tot.kept} kept as written; ${tot.identical} of ${out.filter((x) => !x.endsWith("| - |")).length} files written back identical`);
if (notes.length) console.log("\nNotes:\n  " + notes.join("\n  "));
process.exitCode = KINDS.every((k) => tot[k].ok === tot[k].n) && !tot.kept ? 0 : 1;
