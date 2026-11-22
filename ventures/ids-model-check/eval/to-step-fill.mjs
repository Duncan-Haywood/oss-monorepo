#!/usr/bin/env node
// Fill on a converted model against fill on the exporter's own STEP twin.
// For each X.ifcxml (or X.json with --ext .json) with an X.ifc next to it,
// and each IDS in --ids-dir: model-fill.mjs runs on the ifcXML model (which
// it now writes as STEP first, step-writer.mjs) and on the STEP twin, and the
// two are compared by what a user gets: values written, elements written to,
// failing elements after, and the GlobalId.set.property=value list written.
//
//   node eval/to-step-fill.mjs --ids-dir eval/corpus/real [--ext .json] <dir> ...
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { resources } from "../node.mjs";
import { fillModel } from "../model-fill.mjs";

const argv = process.argv.slice(2);
const take = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const IDS_DIR = take("--ids-dir");
const EXT = take("--ext") || ".ifcxml";
if (!IDS_DIR || !argv.length) { console.error("usage: node eval/to-step-fill.mjs --ids-dir DIR [--ext .json] <dir> ..."); process.exit(2); }
const res = resources();
const idsFiles = readdirSync(IDS_DIR).filter((f) => /\.ids$/i.test(f)).sort().map((f) => [f, readFileSync(join(IDS_DIR, f), "utf8")]);
const extRe = new RegExp(EXT.replace(/\./g, "\\.") + "$", "i");
let runs = 0, same = 0, wroteRuns = 0, valuesStep = 0, valuesConv = 0, errs = 0;
const diffs = [];
let seed = 1;
const random = () => Uint8Array.from({ length: 16 }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255);
// What was written, by GlobalId (ids differ between the two files).
const sig = (r) => JSON.stringify(r.writtenList.map((w) => `${w.globalId}|${w.pset}|${w.prop}|${w.value}`).sort());
let inherited = 0;
for (const dir of argv) {
  for (const f of readdirSync(dir).filter((f) => extRe.test(f)).sort()) {
    const stepPath = join(dir, f.replace(extRe, ".ifc"));
    if (!existsSync(stepPath)) continue;
    const stepText = readFileSync(stepPath, "utf8"), convText = readFileSync(join(dir, f), "utf8");
    for (const [name, ids] of idsFiles) {
      runs++;
      let a, b;
      try { seed = 1; a = fillModel(ids, stepText, { ...res, random }); } catch (e) { a = { error: e.message }; }
      try { seed = 1; b = fillModel(ids, convText, { ...res, random }); } catch (e) { b = { error: e.message }; }
      if (a.error || b.error) {
        if (a.error && b.error && a.error === b.error) { same++; continue; }
        errs++; diffs.push(`${basename(f)} x ${name}: step ${a.error || "ok"} / converted ${b.error || "ok"}`); continue;
      }
      valuesStep += a.written; valuesConv += b.written;
      if (a.written || b.written) wroteRuns++;
      // The same values written; failing counts that differ after by just
      // what they differed before the fill are the two source files'
      // difference (a STEP twin's unreferenced entities, eval/ifcxml-twins-2026-11-18.md),
      // not the fill's.
      const gap = (r) => (r.after ? r.after.failing : 0) - r.before.failing;
      if (sig(a) === sig(b) && gap(a) === gap(b)) { same++; if (a.before.failing !== b.before.failing) inherited++; }
      else diffs.push(`${basename(f)} x ${name}: STEP twin wrote ${a.written} on ${a.elements} (failing after ${a.after && a.after.failing}), converted wrote ${b.written} on ${b.elements} (failing after ${b.after && b.after.failing})`);
    }
  }
}
console.log(`${runs} fills (model x IDS); ${same} write the same values (by GlobalId, set, property and value) on the converted model as on the STEP twin and change the failing count by as much (${inherited} of them start from failing counts that already differ between the two source files); ${wroteRuns} wrote values (${valuesStep} values on the twins, ${valuesConv} on the converted models); ${errs} errors`);
for (const d of diffs.slice(0, 40)) console.log("- " + d);
process.exitCode = diffs.length ? 1 : 0;
