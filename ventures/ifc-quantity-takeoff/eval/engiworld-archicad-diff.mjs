#!/usr/bin/env node
// The change report scored against stated edits: EngiWorld's Archicad tasks.
//
//   node eval/engiworld-archicad-diff.mjs <EngiWorld>/task/single-software-execution/cli/archicad [--json out.json]
//
// Each task folder holds init_file/init.ifc, ground_truth/result.ifc (written
// back through Archicad 27's IFC writer) and task-NN.json, whose instruction
// ends with a JSON list of what the edit must do: "products" to add (class,
// name, storey) and "annotations" on rooms that already exist (properties
// carrying the listed tokens). That list is the answer key. For every pair
// this prints what the change report (diff.mjs, rooms included) found, and
// scores it:
//
//   found      a listed product reported added under its name and class (a
//              room: reported as a room added), on its storey;
//   annotated  a listed room reported changed with every token in its
//              changed properties;
//   extra      anything else reported: an element or room added, removed or
//              changed that the list does not name.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { diffTakeoffs } from "../diff.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args[ji + 1] : null;
const root = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
if (!root) { console.error("usage: node eval/engiworld-archicad-diff.mjs <archicad task folder> [--json out.json]"); process.exit(2); }

const norm = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const tasks = readdirSync(root).filter((d) => /^task-\d+$/.test(d) && existsSync(join(root, d, "ground_truth", "result.ifc"))).sort();
const tot = { tasks: 0, products: 0, found: 0, rooms: 0, roomsFound: 0, annotations: 0, annotated: 0, extra: 0, elementsOnly: { found: 0 } };
const out = [];
for (const t of tasks) {
  const spec = JSON.parse(JSON.parse(readFileSync(join(root, t, `${t}.json`), "utf8")).instruction.match(/explicit task requirements: (\{.*\})\.?\s*$/)[1]);
  const A = takeoff(parseStep(readFileSync(join(root, t, "init_file", "init.ifc"))));
  const B = takeoff(parseStep(readFileSync(join(root, t, "ground_truth", "result.ifc"))));
  const d = diffTakeoffs(A.rows, B.rows, { rooms: [A.rooms, B.rooms] });
  const used = new Set();
  const rec = { task: t, products: [], annotations: [], extra: [] };
  for (const p of spec.products || []) {
    const isRoom = p.class === "IfcSpace";
    const pool = isRoom ? d.rooms.added : d.added;
    const hit = pool.find((r) => !used.has(r) && (isRoom ? true : r.ifcClass === p.class) && norm(isRoom ? r.number ?? r.name : r.name) === norm(p.name) && (!p.storey || norm(r.storey) === norm(p.storey)));
    if (hit) used.add(hit);
    rec.products.push({ class: p.class, name: p.name, found: !!hit });
    tot.products++; if (hit) tot.found++;
    if (isRoom) { tot.rooms++; if (hit) tot.roomsFound++; } else if (hit) tot.elementsOnly.found++;
  }
  for (const a of spec.annotations || []) {
    const c = d.rooms.changed.find((c) => !used.has(c) && norm(c.b.number ?? c.b.name) === norm(a.name));
    const text = c ? norm(Object.values(c.properties).map((v) => v.after).join(" | ")) : "";
    const ok = !!c && (a.tokens || []).every((k) => text.includes(norm(k)));
    if (c) used.add(c);
    rec.annotations.push({ name: a.name, reported: !!c, tokens: ok });
    tot.annotations++; if (ok) tot.annotated++;
  }
  const label = (r) => `${r.ifcClass ?? "IfcSpace"} ${r.name ?? r.number ?? r.globalId}`;
  for (const r of d.added) if (!used.has(r)) rec.extra.push(`element added: ${label(r)}`);
  for (const r of d.removed) rec.extra.push(`element removed: ${label(r)}`);
  for (const c of d.changed) rec.extra.push(`element changed: ${label(c.b)} (${[...Object.keys(c.quantities), ...Object.keys(c.attributes), c.moved ? "moved" : "", c.reshaped ? "reshaped" : ""].filter(Boolean).join(", ")})`);
  for (const r of d.rooms.added) if (!used.has(r)) rec.extra.push(`room added: ${r.number ?? r.name}`);
  for (const r of d.rooms.removed) rec.extra.push(`room removed: ${r.number ?? r.name}`);
  for (const c of d.rooms.changed) if (!used.has(c)) rec.extra.push(`room changed: ${c.b.number ?? c.b.name} (${[...Object.keys(c.attributes), ...Object.keys(c.quantities), ...Object.keys(c.properties).map((k) => k.replace(/^.*\./, ""))].join(", ")})`);
  rec.summary = { elements: [d.summary.before, d.summary.after], byGlobalId: d.summary.byGlobalId, rooms: [d.rooms.summary.before, d.rooms.summary.after], roomsByGlobalId: d.rooms.summary.byGlobalId };
  tot.tasks++; tot.extra += rec.extra.length;
  out.push(rec);
  const miss = rec.products.filter((p) => !p.found).map((p) => `${p.class} ${p.name}`).concat(rec.annotations.filter((a) => !a.tokens).map((a) => `annotation ${a.name}${a.reported ? " (tokens missing)" : ""}`));
  console.log(`${t}: elements ${rec.summary.elements.join(" -> ")} (${rec.summary.byGlobalId} by GlobalId), rooms ${rec.summary.rooms.join(" -> ")}; listed ${rec.products.length} products, ${rec.annotations.length} annotations; found ${rec.products.filter((p) => p.found).length}, annotated ${rec.annotations.filter((a) => a.tokens).length}${miss.length ? `; missed: ${miss.join(", ")}` : ""}${rec.extra.length ? `; extra: ${rec.extra.join("; ")}` : ""}`);
}
console.log(`\n${tot.tasks} pairs: ${tot.found} of ${tot.products} listed products reported added (${tot.roomsFound} of ${tot.rooms} rooms, ${tot.elementsOnly.found} of ${tot.products - tot.rooms} elements); ${tot.annotated} of ${tot.annotations} listed room annotations reported with every token; ${tot.extra} changes reported that the list does not name`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ totals: tot, tasks: out }, null, 1));
