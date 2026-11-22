#!/usr/bin/env node
// ids-model-check CLI: check an IFC model against an IDS file.
//
//   node cli.mjs MODEL.ifc SPEC.ids [--layer LAYER.ifcx ...] [--json] [--bcf out.bcfzip] [--junit out.xml] [--html report.html] [--max-failures N] [--no-audit]
//   node ci-cli.mjs --models GLOB --ids GLOB ...  # many files, for CI (action.yml)
//   node cli.mjs --audit SPEC.ids [--json] [--bsdd]
//                                              # check the IDS itself, no model; --bsdd also looks each
//                                              # facet uri up in buildingSMART's Data Dictionary (bsdd.mjs:
//                                              # the only option that goes on the network)
//   node cli.mjs --fix SPEC.ids [-o OUT.ids] [--word-class xsd|letters]
//                                              # repair its ids.xsd faults (fix.mjs); stdout without -o;
//                                              # --word-class also spells a bare \w in patterns as a class
//                                              # every checker reads alike (xsdregex.mjs spellWordClass)
//   node cli.mjs --link-bsdd SPEC.ids [-o OUT.ids]  # offline: add the IFC 4.3 bSDD uri to standard property
//                                              # facets that have none (bsdd-suggest.mjs); list on stderr
//   node cli.mjs --to-sheet SPEC.ids [-o OUT.xlsx|OUT.csv]   # one row per facet (sheet.mjs); CSV on stdout without -o
//   node cli.mjs --from-sheet SHEET.xlsx|.csv|.tsv [-o OUT.ids] [--by-phase]
//                                              # a table back to IDS 1.0; stdout without -o. An Excel2IDS
//                                              # workbook (excel2ids.mjs) gives one IDS per purpose,
//                                              # OUT_<purpose>.ids (and per phase with --by-phase)
//   node cli.mjs --to-excel2ids SPEC.ids -o OUT.xlsx  # the IDS in the Excel2IDS template layout
//   node cli.mjs --diff OLD.ids NEW.ids [MODEL.ifc] [--json]
//                                              # what a revision of an IDS adds, removes, asks more or
//                                              # less of (revision.mjs); with a model, the elements that
//                                              # newly fail or no longer fail. Exit 0 when the revision
//                                              # asks nothing more, 1 when it does, 2 on a read error
//   node cli.mjs --to-doc SPEC.ids [-o OUT.md|OUT.html]  # the IDS in plain English, every specification as
//                                              # sentences (spec-doc.mjs); Markdown on stdout without -o
//   node cli.mjs --fill MODEL.ifc SPEC.ids -o OUT.ifc [--values FILLED.csv] [--to-fill TODO.csv] [--from-geometry]
//                                              # write the property values the failing checks lack into a
//                                              # copy of the model (model-fill.mjs): values the IDS fixes,
//                                              # and values typed into the Value column of the to-fill table
//                                              # (--to-fill writes it; --values reads it back). Any model
//                                              # format: ifcXML, ifcJSON and IFC5 are written as STEP first
//                                              # Exit 0 when the filled model passes, 1 when it still fails
//                                              # --from-geometry: Qto_ volumes, areas, member surface areas, wall and member lengths, wall heights, slab widths and
//                                              # perimeters, ARCHICAD doors' and windows' sizes no set holds, measured
//                                              # from each element's body (needs ../ifc-quantity-takeoff)
//   node cli.mjs --to-step MODEL.ifcxml|.json|.ifcx|.ifczip -o OUT.ifc
//                                              # the model written as a STEP .ifc file (step-writer.mjs),
//                                              # for tools that read only .ifc; exit 1 when a value could
//                                              # not be carried over exactly (listed on stderr)
//   node cli.mjs --from-bsdd CLASS_URI... [-o OUT.ids] [--sets Pset_A,Pset_B] [--schema IFC4]
//                                              # one specification per bSDD class from its property list
//                                              # (bsdd-spec.mjs; goes on the network like --bsdd); stdout
//                                              # without -o; what could not be carried over on stderr
//
// MODEL may be a STEP .ifc, an .ifcxml, an ifcJSON .json, or an .ifczip holding one.
//
// Exit 0 when every specification passes, 1 when one fails, 2 on a usage or
// read error. Nothing leaves the machine, except the facet uris --bsdd looks up.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { check, resources, readModel } from "./node.mjs";
import { textReport, auditReport } from "./report.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { checkBsdd, bsddReport } from "./bsdd.mjs";
import { bsddIds } from "./bsdd-spec.mjs";
import { suggestBsddLinks, addBsddLinks, suggestReport } from "./bsdd-suggest.mjs";
import { bcfZip } from "./bcf.mjs";
import { htmlReport } from "./html-report.mjs";
import { junitXml } from "./ci.mjs";
import { docFromIds, docToMarkdown, docToHtml, classNamesFrom } from "./spec-doc.mjs";
import { fixStructure } from "./fix.mjs";
import { sheetFromIds, rowsToCsv, rowsToXlsx, sheetToRows, rowsToIds, sheetLists, sheetVersions } from "./sheet.mjs";
import { inflateRawSync } from "node:zlib";
import { readRequirementSheet, idsToExcel2Ids, excel2IdsToXlsx } from "./excel2ids.mjs";
import { diffIds, revisionImpact, revisionReport } from "./revision.mjs";
import { parseModel } from "./node.mjs";
import { fillModel, toFillCsv, readValues, fillReport } from "./model-fill.mjs";
import { toStep } from "./step-writer.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith("--") && a !== "-o" && !["--bcf", "--junit", "--html", "--max-failures", "--word-class", "--sets", "--schema", "--layer", "--values", "--to-fill", "-o"].includes(args[i - 1]));
// --layer FILE (repeatable): an IFC5 layer composed over the .ifcx model,
// in the order given (ifcx.mjs).
const layers = args.flatMap((a, i) => (args[i - 1] === "--layer" ? [a] : []));
if (flag("--from-bsdd") && files.length) {
  // Exit 0 when every class was found, 1 when one was not, 2 on a usage error.
  const schemaId = opt("--schema");
  if (schemaId !== undefined && !["IFC2X3", "IFC4", "IFC4X3"].includes(schemaId)) { console.error("--schema takes IFC2X3, IFC4 or IFC4X3 (for classes outside the IFC dictionary)"); process.exit(2); }
  const R = resources();
  const sets = opt("--sets") ? opt("--sets").split(",").map((x) => x.trim()).filter(Boolean) : null;
  const r = await bsddIds(files, { schemas: R.schemas, psets: R.psets, units: R.bsddUnits, schema: R.schemas.IFC4X3, schemaId, sets });
  for (const n of r.notes) console.error(`note: ${n}`);
  console.error(`${r.specs.length} of ${files.length} class(es) written`);
  if (opt("-o")) writeFileSync(opt("-o"), r.text); else process.stdout.write(r.text);
  process.exitCode = r.specs.length === files.length ? 0 : 1;
} else if (flag("--diff") && (files.length === 2 || files.length === 3)) {
  let idsFiles = files.filter((f) => /\.(ids|xml)$/i.test(f));
  const modelPath = files.find((f) => !idsFiles.includes(f)) || (files.length === 3 ? files[2] : null);
  if (files.length === 3 && idsFiles.length === 3) idsFiles = files.slice(0, 2);
  if (idsFiles.length !== 2) { console.error("--diff takes OLD.ids NEW.ids and optionally a model"); process.exit(2); }
  let d, impact = null;
  try {
    const [a, b] = idsFiles.map((f) => parseIds(readFileSync(f, "utf8")));
    d = diffIds(a, b);
    if (modelPath) {
      const model = parseModel((await readModel(modelPath)).bytes);
      impact = revisionImpact(check(a, model), check(b, model), d);
    }
  } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  if (flag("--json")) console.log(JSON.stringify(impact ? { ...d, impact } : d, null, 2));
  else console.log(revisionReport(d, impact));
  const s = d.summary;
  process.exitCode = s.added || s.tighter || s.mixed ? 1 : 0;
} else if (flag("--fill") && files.length === 2) {
  let [ifcPath, idsPath] = files;
  if (ifcPath.toLowerCase().endsWith(".ids") || ifcPath.toLowerCase().endsWith(".xml")) [ifcPath, idsPath] = [idsPath, ifcPath];
  if (!opt("-o") && !opt("--to-fill")) { console.error("--fill needs -o OUT.ifc (the filled model) or --to-fill TODO.csv (the table to fill in)"); process.exit(2); }
  let r;
  try {
    const read = await readModel(ifcPath);
    // An ifcXML, ifcJSON or IFC5 model is written as STEP first, so the
    // takeoff engine (which reads STEP) can measure it too.
    const parsed = parseModel(read.bytes);
    const model = parsed.format === "STEP" ? read : { text: toStep(parsed, { name: basename(ifcPath).replace(/\.\w+$/, ".ifc") }).text };
    const values = opt("--values") ? readValues(readFileSync(opt("--values"), "utf8")) : [];
    // --from-geometry: Qto_ quantities no set holds, measured from each
    // element's body by ifc-quantity-takeoff (geometry-quantities.mjs)
    let geometry;
    if (flag("--from-geometry")) {
      const { measureModel, geometryLookup } = await import("./geometry-quantities.mjs");
      geometry = geometryLookup(await measureModel(model.text));
    }
    r = fillModel(readFileSync(idsPath, "utf8"), model.text, { ...resources(), values, geometry });
  } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  console.error(fillReport(r));
  if (opt("-o")) writeFileSync(opt("-o"), r.text);
  if (opt("--to-fill")) writeFileSync(opt("--to-fill"), toFillCsv(r.unfilled));
  process.exitCode = r.after && r.after.pass ? 0 : 1;
} else if (flag("--to-step") && files.length === 1) {
  if (!opt("-o")) { console.error("--to-step needs -o OUT.ifc"); process.exit(2); }
  let w, m;
  try {
    m = parseModel((await readModel(files[0])).bytes);
    w = toStep(m, { name: basename(opt("-o")) });
  } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  writeFileSync(opt("-o"), w.text);
  console.error(`wrote ${w.entities.toLocaleString("en-US")} entities from the ${m.format} model (${m.schemaRaw}) to ${opt("-o")}`);
  for (const n of w.notes) console.error("  not carried over exactly: " + n);
  process.exitCode = w.notes.length ? 1 : 0;
} else if (flag("--fix") && files.length === 1) {
  // Exit 0 when the repaired file breaks ids.xsd nowhere, 1 when faults that
  // need a person remain (listed on stderr), 2 when the file is not XML.
  const wordClass = opt("--word-class");
  if (wordClass !== undefined && !["xsd", "letters"].includes(wordClass)) { console.error("--word-class takes xsd (the XML Schema set) or letters (letters, digits, underscore)"); process.exit(2); }
  const r = fixStructure(readFileSync(files[0], "utf8"), { wordClass });
  if (r.error) { console.error(`error: ${r.error}`); process.exit(2); }
  for (const x of r.fixes) console.error(`fixed  line ${x.line}: ${x.message}`);
  for (const x of r.remaining) console.error(`left   line ${x.line ?? "?"}: ${x.message}`);
  console.error(`${r.fixes.length} fixed, ${r.remaining.length} left for a person`);
  if (opt("-o")) writeFileSync(opt("-o"), r.text); else process.stdout.write(r.text);
  process.exitCode = r.remaining.length ? 1 : 0;
} else if (flag("--link-bsdd") && files.length === 1) {
  // Offline: adds the IFC 4.3 bSDD uri to each requirement property facet on a
  // standard property that has none (bsdd-suggest.mjs). Lists them on stderr,
  // writes the IDS to -o or stdout. Exit 0, or 2 when the file is not an IDS.
  const text = readFileSync(files[0], "utf8");
  let list;
  try { list = suggestBsddLinks(text, { psets: resources().psets }); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  console.error(suggestReport(list));
  const out = addBsddLinks(text, list);
  if (opt("-o")) writeFileSync(opt("-o"), out); else process.stdout.write(out);
} else if (flag("--to-sheet") && files.length === 1) {
  // Exit 0, or 2 when the file is not an IDS.
  let r;
  try { r = sheetFromIds(readFileSync(files[0], "utf8")); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  for (const x of r.fixes) console.error(`repaired first, line ${x.line}: ${x.message}`);
  for (const n of r.notes) console.error(`not in the sheet: ${n}`);
  const out = opt("-o");
  if (!out) process.stdout.write(rowsToCsv(r.rows));
  else if (/\.xlsx$/i.test(out)) {
    // The dropdowns offer the classes, sets and data types of the versions the IDS names.
    const load = (f) => JSON.parse(readFileSync(new URL("./schema/" + f, import.meta.url), "utf8"));
    const v = sheetVersions(r.rows).map((x) => x.toLowerCase());
    writeFileSync(out, rowsToXlsx(r.rows, { lists: sheetLists({ schemas: v.map((x) => load(x + ".json")), psets: v.map((x) => load("psets-" + x + ".json")) }) }));
  } else writeFileSync(out, rowsToCsv(r.rows, /\.tsv$/i.test(out) ? "\t" : ","));
} else if (flag("--from-sheet") && files.length === 1) {
  // Exit 0 when the IDS was written, 1 when rows could not be read (listed on stderr), 2 on a read error.
  let r;
  try {
    const bytes = readFileSync(files[0]);
    r = await readRequirementSheet(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), (b) => inflateRawSync(b), { byPhase: flag("--by-phase") });
  } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  if (r.format === "excel2ids") console.error(`read as an Excel2IDS workbook: ${r.files.length} IDS file(s)${r.phases.length && !flag("--by-phase") ? `; phases ${r.phases.join(", ")} named (--by-phase writes one file per phase)` : ""}`);
  for (const w of r.warnings) console.error(`warning row ${w.row}: ${w.message}`);
  // Where Excel2IDS's own tool would read this workbook differently (excel2idsToolNotes).
  if (r.tool) for (const [kind, list] of [["stops", r.tool.stops], ["differs", r.tool.notes]]) for (const x of list) console.error(`excel2ids tool ${kind}${x.row ? ` (row ${x.row}${x.col ? `, col ${x.col}` : ""})` : ""}: ${x.message}`);
  if (!r.files.length) { console.error("no specification has a requirement switched on (an X, or a REPLACEME value, in a column whose toggle is TRUE)"); process.exit(1); }
  let failed = false;
  const out = opt("-o");
  if (!out && r.files.length > 1) { console.error("this workbook gives several IDS files; name one with -o OUT.ids and each is written as OUT_<purpose>.ids"); process.exit(2); }
  for (const f of r.files) {
    const tag = r.files.length > 1 ? `[${f.suffix}] ` : "";
    for (const w of f.warnings) console.error(`${tag}warning row ${w.row}: ${w.message}`);
    for (const x of f.errors) console.error(`${tag}error   row ${x.row}: ${x.message}`);
    if (!f.text) { failed = true; continue; }
    if (!out) { process.stdout.write(f.text); continue; }
    const path = r.files.length > 1 || (r.format === "excel2ids" && f.suffix) ? out.replace(/(\.ids)?$/i, `_${f.suffix}.ids`) : out;
    writeFileSync(path, f.text);
    if (r.format === "excel2ids") console.error(`wrote ${path}`);
  }
  if (failed) process.exit(1);
} else if (flag("--to-doc") && files.length === 1) {
  // Exit 0, or 2 when the file is not an IDS. A repairable ids.xsd fault is
  // repaired first (fix.mjs), as for --to-sheet, so the words match the checker.
  let doc;
  const load = (v) => JSON.parse(readFileSync(new URL(`./schema/${v}.json`, import.meta.url), "utf8"));
  try {
    const text = readFileSync(files[0], "utf8");
    const fx = fixStructure(text);
    doc = docFromIds(!fx.error && fx.fixes.length ? fx.text : text, { classNames: classNamesFrom(["ifc2x3", "ifc4", "ifc4x3"].map(load)) });
  } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  const out = opt("-o");
  const body = out && /\.html?$/i.test(out) ? docToHtml(doc) : docToMarkdown(doc);
  if (out) { writeFileSync(out, body); console.error(`${doc.specs.length} specification(s) written to ${out}`); } else process.stdout.write(body);
} else if (flag("--to-excel2ids") && files.length === 1) {
  // Exit 0 when every specification fits the template, 1 when some are left out (listed), 2 on a read error.
  let w;
  try { w = idsToExcel2Ids(fixStructure(readFileSync(files[0], "utf8")).text || readFileSync(files[0], "utf8")); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  for (const n of w.notes) console.error(`not in the workbook: ${n}`);
  for (const n of w.tool) console.error(`for Excel2IDS's tool: ${n}`);
  console.error(`${w.kept} of ${w.total} specification(s) in the workbook, ${w.requirementRows} requirement row(s)`);
  if (!opt("-o")) { console.error("name the workbook with -o OUT.xlsx"); process.exit(2); }
  writeFileSync(opt("-o"), excel2IdsToXlsx(w.rows));
  process.exitCode = w.kept === w.total ? 0 : 1;
} else if (flag("--audit") && files.length === 1) {
  let ids;
  try { ids = parseIds(readFileSync(files[0], "utf8")); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  const issues = auditIds(ids, resources());
  // --bsdd: exit 1 also when a link is broken or its dataType cannot hold the
  // dictionary's values (level "error"); warnings and notes do not fail.
  const bsdd = flag("--bsdd") ? await checkBsdd(readFileSync(files[0], "utf8"), { schemas: resources().schemas, units: resources().bsddUnits }) : null;
  if (flag("--json")) console.log(JSON.stringify({ title: ids.title, valid: !issues.some((x) => x.level === "error"), issues, ...(bsdd ? { bsdd } : {}) }, null, 2));
  else console.log(auditReport(ids.title, ids.specs, issues) + (bsdd ? "\n" + bsddReport(bsdd) : ""));
  process.exitCode = issues.some((x) => x.level === "error") || (bsdd && bsdd.findings.some((x) => x.level === "error")) ? 1 : 0;
} else if (files.length !== 2 || flag("--help")) {
  console.error("usage: node cli.mjs MODEL.ifc|.ifcxml|.json|.ifcx|.ifczip SPEC.ids [--layer LAYER.ifcx ...] [--json] [--bcf out.bcfzip] [--junit out.xml] [--html report.html] [--max-failures N] [--no-audit]\n       node cli.mjs --audit SPEC.ids [--json] [--bsdd]\n       node cli.mjs --fix SPEC.ids [-o OUT.ids] [--word-class xsd|letters]\n       node cli.mjs --link-bsdd SPEC.ids [-o OUT.ids]\n       node cli.mjs --to-sheet SPEC.ids [-o OUT.xlsx|OUT.csv]\n       node cli.mjs --from-sheet SHEET.xlsx|.csv [-o OUT.ids] [--by-phase]\n       node cli.mjs --to-excel2ids SPEC.ids -o OUT.xlsx\n       node cli.mjs --diff OLD.ids NEW.ids [MODEL.ifc] [--json]\n       node cli.mjs --to-doc SPEC.ids [-o OUT.md|OUT.html]\n       node cli.mjs --fill MODEL.ifc SPEC.ids -o OUT.ifc [--values FILLED.csv] [--to-fill TODO.csv] [--from-geometry]\n       node cli.mjs --to-step MODEL.ifcxml|.json|.ifcx -o OUT.ifc");
  process.exit(2);
} else {
  let [ifcPath, idsPath] = files;
  if (ifcPath.toLowerCase().endsWith(".ids")) [ifcPath, idsPath] = [idsPath, ifcPath];
  let report;
  try {
    const t0 = Date.now();
    const model = await readModel(ifcPath);
    const input = layers.length ? [model.text, ...layers.map((f) => readFileSync(f, "utf8"))] : model.bytes;
    report = check(readFileSync(idsPath, "utf8"), input, { audit: !flag("--no-audit") });
    if (model.name !== ifcPath) report.modelFile = model.name;
    report.seconds = (Date.now() - t0) / 1000;
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
  if (opt("--bcf")) writeFileSync(opt("--bcf"), bcfZip(report, { modelName: ifcPath.split(/[\\/]/).pop() }));
  if (opt("--junit")) writeFileSync(opt("--junit"), junitXml([{ model: ifcPath, ids: idsPath, report }]));
  if (opt("--html")) writeFileSync(opt("--html"), htmlReport(report, { modelName: ifcPath.split(/[\\/]/).pop(), idsName: idsPath.split(/[\\/]/).pop() }));
  if (flag("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(textReport(report, { maxFailures: Number(opt("--max-failures") || 10) }));
  process.exitCode = report.pass ? 0 : 1; // not process.exit(): it cuts off a large piped stdout
}
