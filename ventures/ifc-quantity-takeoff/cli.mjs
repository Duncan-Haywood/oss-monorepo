#!/usr/bin/env node
// Quantity takeoff from an IFC file on the command line.
//
//   node cli.mjs model.ifc                     bill of quantities by class and type (CSV to stdout)
//   node cli.mjs model.ifc --by storey,class   group by other keys (class, type, storey, space (room), material,
//                                              classification, uniformat, uniformat2, uniformat1: Uniformat II level 3, 2, 1)
//   node cli.mjs model.ifc --rooms rooms.csv   room schedule: floor area, perimeter, height, wall area, volume per room
//   node cli.mjs model.ifc --rebar bars.csv    bar bending schedule: bar mark, size, number, cut length, shape, legs, mass
//   node cli.mjs model.ifc --rows rows.csv     every element with stored and computed volumes
//   node cli.mjs model.ifc --check             summary of computed vs stored volumes
//   node cli.mjs model.ifc --json out.json     everything as JSON
//   node cli.mjs new.ifc --compare old.ifc     change in the BoQ since an earlier revision (CSV to stdout)
//   --changes changes.csv                      with --compare: every added, removed, changed or re-identified element
//   --voids-up-to 0.5,0.05                     leave in openings up to 0.5 m2 (areas) and 0.05 m3 (volumes)
//   --voids-up-to "0.5,0.05;slabs=0,0.05"      the same, with a work section's own pair (walls, slabs,
//                                              coverings, frames, other)
//   --tolerance 0.02                           relative difference that still counts as agreeing (default 2%)
//   --unexplained geometry                     where a stored volume or area disagrees with the geometry for no
//                                              known cause, sum the geometry's figure (default: stored); the
//                                              BoQ CSV lists those rows' count and both sums on every line
//   --no-geometry                              stored quantities only (faster)
//   --trust-declared-units                     keep a named unit's declared factor even when it is not that unit

import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv, rowsCsv, checkSummary, unitRepairNote, UNEXPLAINED_CHOICES } from "./qto.mjs";
import { diffTakeoffs, boqDelta, boqDeltaCsv, changesCsv } from "./diff.mjs";
import { parseRule } from "./measure.mjs";
import { roomsCsv } from "./rooms.mjs";
import { rebarSchedule, rebarCsv } from "./rebar.mjs";

const args = process.argv.slice(2);
const VALUED = ["--rooms", "--rebar", "--rows", "--json", "--by", "--compare", "--changes", "--tolerance", "--voids-up-to", "--unexplained"];
const file = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (!file || args.includes("--help")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 23).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(file ? 0 : 2);
}
const by = (opt("--by") || "class,type").split(",").map((s) => s.trim()).filter(Boolean);
for (const k of by) if (!["class", "type", "storey", "space", "material", "classification", "uniformat", "uniformat2", "uniformat1"].includes(k)) { console.error(`unknown --by key: ${k}`); process.exit(2); }
let rule = null;
if (opt("--voids-up-to")) {
  const parsed = parseRule(opt("--voids-up-to"));
  if (parsed.error) { console.error(`--voids-up-to: ${parsed.error}`); process.exit(2); }
  rule = parsed.rule;
}
const unexplained = opt("--unexplained") || "stored";
if (!UNEXPLAINED_CHOICES.includes(unexplained)) { console.error(`--unexplained: one of ${UNEXPLAINED_CHOICES.join(", ")}`); process.exit(2); }
const boqOpts = { unexplained };
const t0 = Date.now();
const model = parseStep(readFileSync(file));
const trustDeclaredUnits = args.includes("--trust-declared-units");
const res = takeoff(model, { geometry: !args.includes("--no-geometry"), tolerance: opt("--tolerance") ? Number(opt("--tolerance")) : undefined, trustDeclaredUnits });
const secs = (Date.now() - t0) / 1000;
if (unitRepairNote(res.units)) console.error(`${file}: ${unitRepairNote(res.units)}`);
if (opt("--compare")) {
  const before = takeoff(parseStep(readFileSync(opt("--compare"))), { geometry: !args.includes("--no-geometry"), trustDeclaredUnits });
  if (unitRepairNote(before.units)) console.error(`${opt("--compare")}: ${unitRepairNote(before.units)}`);
  const d = diffTakeoffs(before.rows, res.rows, { rooms: [before.rooms, res.rooms] });
  const s = d.summary, R = s.rooms;
  console.error(`${opt("--compare")} -> ${file}: ${s.before} -> ${s.after} elements; ${s.unchanged} unchanged, ${s.changed} changed (${s.quantityChanged} quantity, ${s.attributeChanged} attribute, ${s.moved} moved, ${s.reshaped} reshaped), ${s.added} added, ${s.removed} removed, ${s.merged} merged, ${s.split} split, ${s.replacedInPlace} replaced in place; ${s.storeysRenamed} storeys renamed (${s.renamedOnly} elements changed by that alone, counted unchanged), ${s.typesRenamed} types renamed under one GlobalId (still type changes); ${s.byTag + s.byGeometry} matched under a new GlobalId (${s.byTag} by Tag, ${s.byGeometry} by geometry); rooms ${R.before} -> ${R.after}: ${R.changed} changed (${R.propertyChanged} property, ${R.quantityChanged} quantity), ${R.added} added, ${R.removed} removed, ${R.split} split, ${R.merged} merged, ${R.byGeometry} renamed under a new GlobalId`);
  if (opt("--changes")) writeFileSync(opt("--changes"), changesCsv(d));
  process.stdout.write(boqDeltaCsv(boqDelta(before.rows, res.rows, by), by));
  process.exit(0);
}
if (opt("--rows")) writeFileSync(opt("--rows"), rowsCsv(res.rows));
if (opt("--rooms")) writeFileSync(opt("--rooms"), roomsCsv(res.rooms));
if (opt("--rebar")) {
  const sched = rebarSchedule(res.rows);
  writeFileSync(opt("--rebar"), rebarCsv(sched));
  console.error(`${file}: bar schedule: ${sched.total.bars} bars in ${sched.lines.length} lines, ${sched.total.mass.toFixed(1)} kg${sched.notes.length ? "; " + sched.notes.join("; ") : ""}`);
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ schema: res.schema, units: res.units, summary: checkSummary(res.rows), boq: boq(res.rows, by, rule, boqOpts), rooms: res.rooms, rows: res.rows }, null, 1));
if (args.includes("--check")) {
  const s = checkSummary(res.rows);
  console.log(`${file}: ${res.schema}, ${s.elements} elements, ${secs.toFixed(1)} s`);
  console.log(`  volume computed for ${s.computed}; geometry not read for ${s.notRead}; no body for ${s.noBody}; net not computed for ${s.netNotComputed}`);
  console.log(`  stored GrossVolume: ${s.grossAgree} of ${s.grossPairs} agree; stored NetVolume: ${s.netAgree} of ${s.netPairs} agree`);
  console.log(`  stored areas (side, footprint, plan, cross-section): ${s.areaAgree} of ${s.areaPairs} agree with the section cut from the geometry`);
  const why = {};
  for (const r of res.rows) for (const c of Object.values(r.areaCheck || {})) if (!c.agree) why[c.reason] = (why[c.reason] || 0) + 1;
  for (const [r, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`    area ${r}: ${n}`);
  const top = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [r, n] of top) console.log(`  ${n} x ${r}`);
  if (res.rooms.length) {
    const pairs = res.rooms.flatMap((r) => Object.values(r.check));
    const placed = res.rows.filter((r) => r.spaceFrom === "geometry").length, inFile = res.rows.filter((r) => r.spaceFrom === "contained").length;
    console.log(`  rooms: ${res.rooms.length}, ${res.rooms.filter((r) => r.computed).length} measured; stored room quantities: ${pairs.filter((c) => c.agree).length} of ${pairs.length} agree; elements in a room: ${inFile} by the file, ${placed} by where they stand`);
  }
} else if (!opt("--rows") && !opt("--json") && !opt("--rooms") && !opt("--rebar")) {
  process.stdout.write(boqCsv(boq(res.rows, by, rule, boqOpts), by, {}, rule, boqOpts));
}
