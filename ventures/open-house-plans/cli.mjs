#!/usr/bin/env node
// @ts-check
// Command line for Open House Plans.
//
//   node cli.mjs design --text "3 bed 2 bath craftsman, 1500 sq ft" --out my-house
//   node cli.mjs design --brief brief.json --out my-house --zip
//   node cli.mjs design --beds 4 --baths 2.5 --garage 2 --style ranch --json
//   node cli.mjs parse "two bedroom cottage with a porch"
//   node cli.mjs options
//
// `design` prints a summary (or JSON with --json) and, with --out, writes the
// whole plan set: drawings (SVG, DXF), 3D (OBJ, IFC), schedules (CSV), the
// design as JSON, a README and the CC0 licence. Everything runs locally.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { design, designFiles, parseBrief, DEFAULTS } from "./engine.mjs";
import { STYLES } from "./styles.mjs";
import { zip } from "./zip.mjs";

const HELP = `Open House Plans: free, parametric house plans from a brief (CC0 output).

Usage:
  node cli.mjs design [brief options] [--out DIR] [--zip] [--json]
  node cli.mjs parse "<plain-English request>"
  node cli.mjs options

Brief options (all optional):
  --text "..."          plain English, e.g. "3 bed 2 bath farmhouse, 1400 sq ft, 2-car garage"
  --brief FILE.json     a JSON brief (fields below); flags override it
  --beds N --baths N --area SQFT --style NAME --priority budget|balanced|beauty
  --garage 0|1|2 --porch auto|true|false --foundation slab|crawl --frame advanced|conventional
  --accessible --split auto|true|false --max-width FT --max-depth FT --lot WxD
  --snow PSF --wind MPH --finish basic|standard|premium --region FACTOR --ceiling FT --variant N

Output:
  --out DIR   write the plan set into DIR
  --zip       also write DIR.zip
  --json      print the design summary as JSON

Not for construction: a licensed review, the local code and a permit come first.`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function briefFrom(args) {
  let b = {};
  if (args.brief) b = JSON.parse(readFileSync(args.brief, "utf8"));
  if (args.text) b.text = args.text;
  const nums = ["beds", "baths", "area", "garage", "maxWidth", "maxDepth", "snow", "wind", "region", "ceiling", "variant"];
  for (const k of nums) if (args[k] !== undefined) b[k] = Number(args[k]);
  for (const k of ["style", "priority", "foundation", "frame", "finish", "name"]) if (args[k] !== undefined) b[k] = args[k];
  for (const k of ["porch", "split"]) if (args[k] !== undefined) b[k] = args[k] === true ? true : args[k];
  if (args.accessible) b.accessible = true;
  if (args.lot) {
    const [w, d] = String(args.lot).split(/x/i).map(Number);
    b.lot = { width: w, ...(d ? { depth: d } : {}) };
  }
  return b;
}

const money = (v) => "$" + Math.round(v).toLocaleString("en-US");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || args.help || cmd === "help") { console.log(HELP); return 0; }
  if (cmd === "options") {
    console.log(JSON.stringify({ defaults: DEFAULTS, styles: Object.fromEntries(Object.entries(STYLES).map(([k, s]) => [k, s.label])) }, null, 2));
    return 0;
  }
  if (cmd === "parse") {
    console.log(JSON.stringify(parseBrief(args._.slice(1).join(" ") || args.text || ""), null, 2));
    return 0;
  }
  if (cmd !== "design") { console.error(`unknown command "${cmd}"\n\n${HELP}`); return 2; }
  const b = briefFrom(args);
  if (!args.out) {
    const r = design(b);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return r.error ? 1 : 0; }
    if (r.error) { console.error(r.error); return 1; }
    printSummary(r.design, r.notes);
    return 0;
  }
  const r = designFiles(b);
  if (r.error) { console.error(r.error); return 1; }
  mkdirSync(args.out, { recursive: true });
  for (const [name, data] of Object.entries(r.files)) writeFileSync(join(args.out, name), data);
  if (args.zip) writeFileSync(`${args.out.replace(/\/$/, "")}.zip`, zip(Object.entries(r.files).map(([name, data]) => ({ name: `${r.design.id}/${name}`, data }))));
  if (args.json) console.log(JSON.stringify({ brief: r.brief, notes: r.notes, design: r.design, files: Object.keys(r.files).map((f) => join(args.out, f)) }, null, 2));
  else {
    printSummary(r.design, r.notes);
    console.log(`\nWrote ${Object.keys(r.files).length} files to ${args.out}${args.zip ? ` and ${args.out.replace(/\/$/, "")}.zip` : ""}`);
  }
  return 0;
}

function printSummary(s, notes) {
  console.log(s.title);
  console.log(`  ${s.footprint.width} x ${s.footprint.depth} ft, ${s.style.roof} roof ${s.style.pitch}, ${s.heights.ceiling} ft ceilings`);
  console.log(`  construction cost ${money(s.cost.total)} (${money(s.cost.perSqFt)}/sq ft; NAHB-anchored estimate, not a quote)`);
  console.log(`  checks: ${s.checks.passed} passed${s.checks.failed.length ? `, failed: ${s.checks.failed.join("; ")}` : ", none failed"}`);
  console.log("  rooms:");
  for (const r of s.rooms) if (r.kind !== "closet") console.log(`    ${r.name.padEnd(22)} ${r.clear.padEnd(18)} ${r.area} sq ft`);
  for (const n of notes) console.log(`  note: ${n}`);
}

process.exitCode = main();
