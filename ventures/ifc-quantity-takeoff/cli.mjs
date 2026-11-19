#!/usr/bin/env node
// Quantity takeoff from an IFC file on the command line.
//
//   node cli.mjs model.ifc                     bill of quantities by class and type (CSV to stdout)
//   node cli.mjs model.ifc --by storey,class   group by other keys (class, type, storey, material, classification)
//   node cli.mjs model.ifc --rows rows.csv     every element with stored and computed volumes
//   node cli.mjs model.ifc --check             summary of computed vs stored volumes
//   node cli.mjs model.ifc --json out.json     everything as JSON
//   --tolerance 0.02                           relative difference that still counts as agreeing (default 2%)
//   --no-geometry                              stored quantities only (faster)

import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv, rowsCsv, checkSummary } from "./qto.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !/^\d/.test(a) && args[args.indexOf(a) - 1] !== "--rows" && args[args.indexOf(a) - 1] !== "--json" && args[args.indexOf(a) - 1] !== "--by");
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (!file || args.includes("--help")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(file ? 0 : 2);
}
const by = (opt("--by") || "class,type").split(",").map((s) => s.trim()).filter(Boolean);
for (const k of by) if (!["class", "type", "storey", "material", "classification"].includes(k)) { console.error(`unknown --by key: ${k}`); process.exit(2); }
const t0 = Date.now();
const model = parseStep(readFileSync(file));
const res = takeoff(model, { geometry: !args.includes("--no-geometry"), tolerance: opt("--tolerance") ? Number(opt("--tolerance")) : undefined });
const secs = (Date.now() - t0) / 1000;
if (opt("--rows")) writeFileSync(opt("--rows"), rowsCsv(res.rows));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ schema: res.schema, units: res.units, summary: checkSummary(res.rows), boq: boq(res.rows, by), rows: res.rows }, null, 1));
if (args.includes("--check")) {
  const s = checkSummary(res.rows);
  console.log(`${file}: ${res.schema}, ${s.elements} elements, ${secs.toFixed(1)} s`);
  console.log(`  volume computed for ${s.computed}; geometry not read for ${s.notRead}; no body for ${s.noBody}; net not computed for ${s.netNotComputed}`);
  console.log(`  stored GrossVolume: ${s.grossAgree} of ${s.grossPairs} agree; stored NetVolume: ${s.netAgree} of ${s.netPairs} agree`);
  const top = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [r, n] of top) console.log(`  ${n} x ${r}`);
} else if (!opt("--rows") && !opt("--json")) {
  process.stdout.write(boqCsv(boq(res.rows, by), by));
}
