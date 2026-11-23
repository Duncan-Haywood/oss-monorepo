#!/usr/bin/env node
// The change report on consecutive revisions of real models.
//
//   node eval/revision-diff.mjs a.ifc b.ifc [c.ifc ...] [--json out.json]
//
// Compares each file with the one before it (diff.mjs) and prints, per pair:
// how many elements matched and how (GlobalId, Tag, geometry), what changed,
// the merged/split groups (parts and hosts), and what a GlobalId-only
// comparison would have reported instead.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, rowQuantities } from "../qto.mjs";
const volOf = (r) => rowQuantities(r).volume ?? null;
import { diffTakeoffs, boqDelta, roomChangeText } from "../diff.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args[ji + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
if (files.length < 2) { console.error("usage: node eval/revision-diff.mjs a.ifc b.ifc [...] [--json out.json]"); process.exit(2); }

const runs = files.map((f) => {
  const t0 = Date.now();
  const res = takeoff(parseStep(readFileSync(f)));
  const rows = res.rows;
  const noBox = rows.filter((r) => !r.isAssembly && !r.box).length;
  console.log(`${basename(f)}: ${res.schema}, ${rows.length} elements (${noBox} without a box), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { file: f, rows, rooms: res.rooms };
});

const count = (xs, key) => { const m = {}; for (const x of xs) { const k = key(x); m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const out = [];
for (let i = 1; i < runs.length; i++) {
  const A = runs[i - 1], B = runs[i];
  const d = diffTakeoffs(A.rows, B.rows, { rooms: [A.rooms, B.rooms] });
  const s = d.summary;
  // what a GlobalId-only comparison reports
  const ga = new Set(A.rows.filter((r) => !r.isAssembly).map((r) => r.globalId)), gb = new Set(B.rows.filter((r) => !r.isAssembly).map((r) => r.globalId));
  const gidOnly = { added: [...gb].filter((g) => !ga.has(g)).length, removed: [...ga].filter((g) => !gb.has(g)).length };
  const what = {};
  for (const c of d.changed) {
    for (const k of Object.keys(c.quantities)) what[`quantity: ${k}`] = (what[`quantity: ${k}`] || 0) + 1;
    for (const k of Object.keys(c.attributes)) what[`attribute: ${k}`] = (what[`attribute: ${k}`] || 0) + 1;
    if (c.moved) what.moved = (what.moved || 0) + 1;
    if (c.reshaped) what.reshaped = (what.reshaped || 0) + 1;
  }
  const moves = count(d.changed.filter((c) => c.moved), (c) => c.moved.by.map((v) => v.toFixed(2)).join(", "));
  const delta = boqDelta(A.rows, B.rows, ["class"]).filter((l) => l.delta.count || Math.abs(l.delta.volume) > 1e-6);
  const rec = {
    before: basename(A.file), after: basename(B.file), summary: s, gidOnly, what,
    reid: count([...d.changed, ...d.unchanged].filter((p) => p.how === "tag" || p.how === "geometry"), (p) => `${p.how}: ${p.b.ifcClass}`),
    replaced: d.changed.filter((c) => c.how === "place").map((c) => ({ class: c.b.ifcClass, storey: c.b.storey, before: c.a.type || c.a.name, after: c.b.type || c.b.name, moved: c.moved ? c.moved.distance : null, reshaped: !!c.reshaped, volume: [volOf(c.a), volOf(c.b)] })),
    renames: d.renames, materialIdsKept: d.materialIdsKept,
    materialSwaps: d.materialSwaps.map((m) => ({ before: m.before, after: m.after, elements: m.elements, renamedInPlace: m.renamedInPlace, volume: m.volume, area: m.area, classes: m.classes })),
    groups: d.groups.map((g) => ({ kind: g.kind, before: g.before.map((r) => `${r.ifcClass} ${r.name}`), after: g.after.map((r) => `${r.ifcClass} ${r.name}`), volumeBefore: g.volumeBefore, volumeAfter: g.volumeAfter })),
    added: count(d.added, (r) => r.ifcClass), removed: count(d.removed, (r) => r.ifcClass),
    moves: Object.fromEntries(Object.entries(moves).slice(0, 6)),
    rooms: { summary: d.rooms.summary, added: d.rooms.added.map((r) => ({ globalId: r.globalId, number: r.number, name: r.name, storey: r.storey, floorArea: r.computed?.floorArea ?? null })), removed: d.rooms.removed.map((r) => ({ globalId: r.globalId, number: r.number, name: r.name, storey: r.storey })), changed: d.rooms.changed.map((c) => ({ globalId: c.b.globalId, number: c.b.number, how: c.how, what: roomChangeText(c, { short: true }) })) },
    boqByClass: delta.map((l) => ({ class: l.key[0], count: [l.before.count, l.after.count], volume: [l.before.volume, l.after.volume] })),
  };
  out.push(rec);
  console.log(`\n${rec.before} -> ${rec.after}`);
  console.log(`  elements ${s.before} -> ${s.after}; matched ${s.matched} (GlobalId ${s.byGlobalId}, Tag ${s.byTag}, geometry ${s.byGeometry}); unchanged ${s.unchanged}, changed ${s.changed}; added ${s.added}, removed ${s.removed}; merged ${s.merged}, split ${s.split}; replaced in place ${s.replacedInPlace}`);
  console.log(`  a GlobalId-only comparison: ${gidOnly.added} added, ${gidOnly.removed} removed; GlobalIds repeated within a file: ${s.duplicateGlobalIds.before} before, ${s.duplicateGlobalIds.after} after`);
  console.log(`  changed: ${JSON.stringify(what)}`);
  console.log(`  new GlobalId: ${JSON.stringify(rec.reid)}`);
  for (const k of ["storey", "type"]) for (const r of d.renames[k]) console.log(`  ${k} renamed (same GlobalId): ${r.before} -> ${r.after} (${r.elements} elements)${k === "storey" ? `; elements changed by a storey rename alone, counted unchanged: ${s.renamedOnly}` : "; still type changes"}`);
  for (const r of d.renames.material) console.log(`  material renamed (${r.entity} #${r.entityId}, file kept its STEP ids): ${r.before ?? "(none)"} -> ${r.after ?? "(none)"} (${r.elements} elements); still material changes`);
  for (const m of rec.materialSwaps) console.log(`  material swap: ${m.before ?? "(none)"} -> ${m.after ?? "(none)"}: ${m.elements} elements (${Object.entries(m.classes).map(([k, v]) => `${v} ${k}`).join(", ")}), ${m.volume.toFixed(3)} m3${m.renamedInPlace ? `; ${m.renamedInPlace} of ${m.elements} the same entity renamed` : ""}`);
  for (const g of rec.groups) console.log(`  ${g.kind}: ${g.before.length} -> ${g.after.length}  ${g.kind === "merged" ? g.after[0] : g.before[0]}  volume ${g.volumeBefore.toFixed(4)} -> ${g.volumeAfter.toFixed(4)} m3`);
  for (const r of rec.replaced) console.log(`  replaced in place: ${r.class} (${r.storey}) ${r.before === r.after ? r.before : `${r.before} -> ${r.after}`}${r.moved != null ? `, moved ${r.moved.toFixed(3)} m` : ""}${r.reshaped ? ", box resized" : ""}, volume ${r.volume.map((v) => (v == null ? "-" : v.toFixed(4))).join(" -> ")} m3`);
  console.log(`  added: ${JSON.stringify(rec.added)}`);
  console.log(`  removed: ${JSON.stringify(rec.removed)}`);
  const R = d.rooms.summary;
  console.log(`  rooms ${R.before} -> ${R.after}; matched ${R.matched} (GlobalId ${R.byGlobalId}, number and name ${R.byName}); unchanged ${R.unchanged}, changed ${R.changed} (${R.attributeChanged} attribute, ${R.propertyChanged} property, ${R.quantityChanged} quantity); added ${R.added}, removed ${R.removed}; floor area ${R.floorAreaBefore.toFixed(2)} -> ${R.floorAreaAfter.toFixed(2)} m2`);
  for (const r of d.rooms.added) console.log(`  room added: ${[r.number, r.name].filter(Boolean).join(" ")} (${r.storey}), ${r.computed?.floorArea != null ? r.computed.floorArea.toFixed(2) + " m2" : "no floor area"}`);
  for (const r of d.rooms.removed) console.log(`  room removed: ${[r.number, r.name].filter(Boolean).join(" ")} (${r.storey})`);
  for (const c of d.rooms.changed) console.log(`  room changed: ${c.b.number ?? c.b.name}${c.how === "name" ? " (new GlobalId)" : ""}: ${roomChangeText(c, { short: true })}`);
  if (Object.keys(rec.moves).length) console.log(`  commonest moves (dx, dy, dz m): ${JSON.stringify(rec.moves)}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
