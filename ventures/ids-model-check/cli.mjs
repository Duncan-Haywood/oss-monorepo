#!/usr/bin/env node
// ids-model-check CLI: check an IFC model against an IDS file.
//
//   node cli.mjs MODEL.ifc SPEC.ids [--json] [--bcf out.bcfzip] [--junit out.xml] [--max-failures N] [--no-audit]
//   node ci-cli.mjs --models GLOB --ids GLOB ...  # many files, for CI (action.yml)
//   node cli.mjs --audit SPEC.ids [--json]     # check the IDS itself, no model
//   node cli.mjs --fix SPEC.ids [-o OUT.ids]   # repair its ids.xsd faults (fix.mjs); stdout without -o
//
// MODEL may be a STEP .ifc, an .ifcxml, or an .ifczip holding either.
//
// Exit 0 when every specification passes, 1 when one fails, 2 on a usage or
// read error. Nothing leaves the machine.
import { readFileSync, writeFileSync } from "node:fs";
import { check, resources, readModel } from "./node.mjs";
import { textReport, auditReport } from "./report.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { bcfZip } from "./bcf.mjs";
import { junitXml } from "./ci.mjs";
import { fixStructure } from "./fix.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith("--") && a !== "-o" && !["--bcf", "--junit", "--max-failures", "-o"].includes(args[i - 1]));
if (flag("--fix") && files.length === 1) {
  // Exit 0 when the repaired file breaks ids.xsd nowhere, 1 when faults that
  // need a person remain (listed on stderr), 2 when the file is not XML.
  const r = fixStructure(readFileSync(files[0], "utf8"));
  if (r.error) { console.error(`error: ${r.error}`); process.exit(2); }
  for (const x of r.fixes) console.error(`fixed  line ${x.line}: ${x.message}`);
  for (const x of r.remaining) console.error(`left   line ${x.line ?? "?"}: ${x.message}`);
  console.error(`${r.fixes.length} fixed, ${r.remaining.length} left for a person`);
  if (opt("-o")) writeFileSync(opt("-o"), r.text); else process.stdout.write(r.text);
  process.exitCode = r.remaining.length ? 1 : 0;
} else if (flag("--audit") && files.length === 1) {
  let ids;
  try { ids = parseIds(readFileSync(files[0], "utf8")); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  const issues = auditIds(ids, resources());
  if (flag("--json")) console.log(JSON.stringify({ title: ids.title, valid: !issues.some((x) => x.level === "error"), issues }, null, 2));
  else console.log(auditReport(ids.title, ids.specs, issues));
  process.exitCode = issues.some((x) => x.level === "error") ? 1 : 0;
} else if (files.length !== 2 || flag("--help")) {
  console.error("usage: node cli.mjs MODEL.ifc|.ifcxml|.ifczip SPEC.ids [--json] [--bcf out.bcfzip] [--junit out.xml] [--max-failures N] [--no-audit]\n       node cli.mjs --audit SPEC.ids [--json]\n       node cli.mjs --fix SPEC.ids [-o OUT.ids]");
  process.exit(2);
} else {
  let [ifcPath, idsPath] = files;
  if (ifcPath.toLowerCase().endsWith(".ids")) [ifcPath, idsPath] = [idsPath, ifcPath];
  let report;
  try {
    const t0 = Date.now();
    const model = await readModel(ifcPath);
    report = check(readFileSync(idsPath, "utf8"), model.bytes, { audit: !flag("--no-audit") });
    if (model.name !== ifcPath) report.modelFile = model.name;
    report.seconds = (Date.now() - t0) / 1000;
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
  if (opt("--bcf")) writeFileSync(opt("--bcf"), bcfZip(report, { modelName: ifcPath.split(/[\\/]/).pop() }));
  if (opt("--junit")) writeFileSync(opt("--junit"), junitXml([{ model: ifcPath, ids: idsPath, report }]));
  if (flag("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(textReport(report, { maxFailures: Number(opt("--max-failures") || 10) }));
  process.exitCode = report.pass ? 0 : 1; // not process.exit(): it cuts off a large piped stdout
}
