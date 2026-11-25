#!/usr/bin/env node
// What the IDS editor offers from a model's property values, measured on real
// models, and whether a requirement built from an offer passes that model.
//
// For every (class, set, property) a model carries with at least one value,
// read as the editor reads it (modelInventory + modelSets + modelValueOffer):
//   - is the full list of values known (no more than inventory.mjs lists)?
//   - "Allow exactly these values" (text) or "Use the model's range" (numbers)
//     offered?
//   - on a standard property with an enumeration, values the standard's list
//     lacks (a one-of check limited to it fails those objects)?
// Then every offer is written as an IDS requirement ("if present, must match",
// exact class) and checked against the same model with the checker. The
// editor's values come from the checker's own reader, so every one should pass:
// a failure is a disagreement between what the editor offers and what a check
// accepts.
//
//   node eval/model-values.mjs [--naive] [--typed] DIR [DIR...]    (every .ifc/.ifcxml/.ifczip below)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Model } from "../ids.mjs";
import { resources, readModel, check } from "../node.mjs";
import { modelInventory } from "../inventory.mjs";
import { setsFor, propertiesOf, modelSets, modelValueOffer, ownSetName, blankSpec, blankReq, stateToDoc, buildIds, mixedModelTypes, untypeOwnRow } from "../editor.mjs";

const R = resources();
// --naive: ranges from the bounds as displayed (12 significant digits), the
// numbers an author would copy, to count how many of those fail their model.
const naive = process.argv.includes("--naive");
// --typed: own properties written in several types keep the commonest dataType
// (the page before 2026-11-24), to show the failures Accept any data type removes.
const typedMixed = process.argv.includes("--typed");
const walk = (d) => !statSync(d).isDirectory() ? [d] : readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ifc|ifcxml|ifczip)$/i.test(f) ? [p] : []; });
const files = process.argv.slice(2).filter((a) => !a.startsWith("--")).flatMap(walk).sort();
const kindOf = (S, dt) => { const p = dt && S.types[dt] ? S.prim(dt) : null; return !p ? null : p === "double" || p === "integer" ? "number" : p === "boolean" || p === "logical" ? "bool" : "text"; };

const tot = { rounded: 0, models: 0, props: 0, withValues: 0, complete: 0, oneOf: 0, range: 0, enumProps: 0, outside: 0, typeDiff: 0, checked: 0, passed: 0, mixed: 0, mixedPresence: 0 };
const rows = [], outsideEx = [], fails = [];
for (const f of files) {
  const text = (await readModel(f)).text;
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const S = R.schemas[inv.schema], ps = R.psets[inv.schema], tm = inv.schema === "IFC2X3" ? R.typeMap : null;
  const L = { S, psets: ps, tm };
  const m = { props: 0, withValues: 0, complete: 0, oneOf: 0, range: 0, outside: 0, specs: [] };
  for (const c of inv.classes) {
    const std = setsFor(ps, S, c.cls, tm);
    for (const set of modelSets(inv, [c.cls], std)) {
      const own = !set.standard && ownSetName(set.name);
      if (!set.standard && !own) continue; // a Pset_ name the class cannot carry: the editor offers no row
      for (const p of set.props) {
        m.props++;
        let kind, enumVals = null, dataType;
        if (set.standard) {
          const t = propertiesOf(ps, S, set.name).find((x) => x.name === p.name);
          if (!t || !t.dataType) continue;
          dataType = t.dataType; kind = kindOf(S, dataType); enumVals = t.enum;
          if (enumVals) tot.enumProps++;
          if (p.dataType && p.dataType !== dataType) { tot.typeDiff++; continue; } // the editor's other hint; a dataType check fails these anyway
        } else { dataType = p.dataType; kind = kindOf(S, dataType); }
        const o = modelValueOffer(p, kind, enumVals);
        if (!o) continue;
        m.withValues++;
        if (o.complete) m.complete++;
        if (o.outside.length) { m.outside++; if (outsideEx.length < 12) outsideEx.push(`${c.cls} ${set.name}.${p.name}: ${o.outside.slice(0, 3).map(([v, n]) => `${v} (${n})`).join(", ")}`); }
        let req = { ...blankReq(), custom: !set.standard, set: set.name, name: p.name, dataType: set.standard ? "" : dataType, cardinality: "optional" };
        if (o.oneOf) { m.oneOf++; Object.assign(req, { mode: "oneOf", oneOf: o.oneOf }); }
        else if (kind === "number" && o.min !== null) { m.range++; const n12 = (x) => String(Number(x.toPrecision(12))); if (o.rangeMin !== n12(o.min) || o.rangeMax !== n12(o.max)) tot.rounded++; Object.assign(req, naive ? { mode: "range", min: n12(o.min), max: n12(o.max) } : { mode: "range", min: o.rangeMin, max: o.rangeMax }); }
        else continue;
        // An own property written in several types: the page warns and offers
        // Accept any data type (untypeOwnRow); with --typed the row keeps the
        // commonest type, as the page did before 2026-11-24.
        if (!set.standard && mixedModelTypes(p)) {
          tot.mixed++;
          const u = !typedMixed && untypeOwnRow(S, req, p);
          if (u) { req = u.row; if (u.dropped) tot.mixedPresence++; }
        }
        m.specs.push({ ...blankSpec(), name: `${c.cls} ${set.name}.${p.name}`, cls: c.cls, withSub: false, reqs: [req] });
      }
    }
  }
  let passed = 0;
  if (m.specs.length) {
    const ids = buildIds(stateToDoc({ title: "offers", schema: inv.schema, specs: m.specs }, L), S);
    const r = check(ids, text);
    for (const s of r.specs) { if (s.status === "pass") passed++; else if (fails.length < 12) fails.push(`${f.split("/").pop()}: ${s.name}: ${(s.failed || []).slice(0, 1).map((x) => x.why || (x.reasons || []).join("; ").slice(0, 220)).join("")}`); }
  }
  tot.models++;
  for (const k of ["props", "withValues", "complete", "oneOf", "range", "outside"]) tot[k] += m[k];
  tot.checked += m.specs.length; tot.passed += passed;
  rows.push(`| ${f.split("/").slice(-2).join("/")} | ${inv.schema} | ${m.props} | ${m.withValues} | ${m.complete} | ${m.oneOf} | ${m.range} | ${m.outside} | ${passed} of ${m.specs.length} |`);
}
console.log("| Model | Schema | Props offered as rows | With values | Full list known | One-of offered | Range offered | Values outside the standard's list | Built from offers: pass |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
console.log(rows.join("\n"));
console.log(`\n${tot.models} models: ${tot.props} property rows, ${tot.withValues} with values, ${tot.complete} with the full list known; one-of offered ${tot.oneOf}, range offered ${tot.range}; standard enumerated properties carried ${tot.enumProps}, with values outside the list ${tot.outside}; skipped for another data type ${tot.typeDiff}; own properties written in several types ${tot.mixed}${typedMixed ? " (kept the commonest dataType, --typed)" : ` (written with no dataType, as Accept any data type does; ${tot.mixedPresence} of them presence only)`}.`);
console.log(`ranges whose bound as displayed (12 digits) would fail an object, so the offer rounds outward: ${tot.rounded} of ${tot.range}`);
console.log(`requirements built from offers: ${tot.passed} of ${tot.checked} pass on their own model`);
if (outsideEx.length) console.log("\nValues outside the standard's list:\n  " + outsideEx.join("\n  "));
if (fails.length) console.log("\nFailures:\n  " + fails.join("\n  "));
process.exitCode = tot.passed === tot.checked ? 0 : 1;
