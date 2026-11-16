#!/usr/bin/env node
// ids-model-check CLI: check an IFC model against an IDS file.
//
//   node cli.mjs MODEL.ifc SPEC.ids [--json] [--bcf out.bcfzip] [--max-failures N]
//
// MODEL may be a STEP .ifc, an .ifcxml, or an .ifczip holding either.
//
// Exit 0 when every specification passes, 1 when one fails, 2 on a usage or
// read error. Nothing leaves the machine.
import { readFileSync, writeFileSync } from "node:fs";
import { check, readModel } from "./node.mjs";
import { textReport } from "./report.mjs";
import { bcfZip } from "./bcf.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith("--") && !["--bcf", "--max-failures"].includes(args[i - 1]));
if (files.length !== 2 || flag("--help")) {
  console.error("usage: node cli.mjs MODEL.ifc|.ifcxml|.ifczip SPEC.ids [--json] [--bcf out.bcfzip] [--max-failures N]");
  process.exit(2);
}
let [ifcPath, idsPath] = files;
if (ifcPath.toLowerCase().endsWith(".ids")) [ifcPath, idsPath] = [idsPath, ifcPath];
let report;
try {
  const t0 = Date.now();
  const model = await readModel(ifcPath);
  report = check(readFileSync(idsPath, "utf8"), model.text);
  if (model.name !== ifcPath) report.modelFile = model.name;
  report.seconds = (Date.now() - t0) / 1000;
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
if (opt("--bcf")) writeFileSync(opt("--bcf"), bcfZip(report, { modelName: ifcPath.split(/[\\/]/).pop() }));
if (flag("--json")) console.log(JSON.stringify(report, null, 2));
else console.log(textReport(report, { maxFailures: Number(opt("--max-failures") || 10) }));
process.exitCode = report.pass ? 0 : 1; // not process.exit(): it cuts off a large piped stdout
