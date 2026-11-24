#!/usr/bin/env node
// The change report on EngiWorld's other Archicad folders: the gui tasks and
// the cross-software chains. Rooms are compared twice, the old way (GlobalId,
// then number and name) and with the geometry match and split/merge groups
// added on 2026-11-24, so the difference is measured, not asserted.
//
//   node eval/engiworld-gui-cross.mjs <EngiWorld>/task [--json out.json]
//
// Sets read (each task folder: init_file/init.ifc and ground_truth/*.ifc):
//   gui     single-software-execution/gui/archicad: init.ifc -> result.ifc
//           (15 of 20 tasks have an init; the 5 others start blank). The
//           instruction names the rooms the result must hold; eval.py's SPEC
//           holds the counts and spans.
//   ac-os   cross-software-coordination/cli/archicad--openstudio:
//           init.ifc -> stage1.ifc (the Archicad stage).
//   rv-ac   cross-software-coordination/cli/revit--archicad--openstudio:
//           init.ifc -> stage1.ifc (Revit stage, a stated room split) and
//           stage1.ifc -> stage2.ifc (Archicad loads and saves Revit's file:
//           a round trip with no stated change, so every reported change is
//           what the round trip itself does to the model).
//
// For each pair: elements before -> after with how they were matched, and
// rooms: matched (how), changed, added, removed, split, merged. "Lost rooms"
// counts rooms reported removed or added only, the lines an estimator would
// have to resolve by hand.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { diffTakeoffs, diffRooms, roomChangeText } from "../diff.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args[ji + 1] : null;
const root = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
if (!root) { console.error("usage: node eval/engiworld-gui-cross.mjs <EngiWorld>/task [--json out.json]"); process.exit(2); }

const SETS = [
  { key: "gui", dir: "single-software-execution/gui/archicad", steps: [["init_file/init.ifc", "ground_truth/result.ifc"]] },
  { key: "ac-os", dir: "cross-software-coordination/cli/archicad--openstudio", steps: [["init_file/init.ifc", "ground_truth/stage1.ifc"]] },
  { key: "rv-ac", dir: "cross-software-coordination/cli/revit--archicad--openstudio", steps: [["init_file/init.ifc", "ground_truth/stage1.ifc"], ["ground_truth/stage1.ifc", "ground_truth/stage2.ifc"]] },
];
const cache = new Map();
const read = (f) => { if (!cache.has(f)) cache.set(f, takeoff(parseStep(readFileSync(f)))); return cache.get(f); };
const writer = (f) => (readFileSync(f, "latin1").slice(0, 2000).match(/FILE_NAME\([^;]*?'([^']*)','([^']*)',''\);/) || [])[1] ?? "?";
const label = (r) => [r.number, r.name].filter(Boolean).join(" ") || `#${r.id}`;
// rooms reported only as added or removed, with nothing saying where they came from
const lost = (R) => R.added.filter((r) => !(R.carved || []).some((k) => k.rooms.includes(r))).length + R.removed.length;

const out = [];
const tot = {};
for (const set of SETS) {
  const base = join(root, set.dir);
  if (!existsSync(base)) { console.log(`${set.key}: ${base} not found, skipped`); continue; }
  const T = (tot[set.key] = {});
  for (const t of readdirSync(base).filter((d) => /^task-\d+$/.test(d)).sort()) {
    for (const [fa, fb] of set.steps) {
      const pa = join(base, t, fa), pb = join(base, t, fb);
      if (!existsSync(pa) || !existsSync(pb)) continue;
      const step = `${fa.replace(/^.*\//, "").replace(".ifc", "")}->${fb.replace(/^.*\//, "").replace(".ifc", "")}`;
      const A = read(pa), B = read(pb);
      const d = diffTakeoffs(A.rows, B.rows, { rooms: [A.rooms, B.rooms] });
      const old = diffRooms(A.rooms, B.rooms, { roomOverlap: 0, roomGroups: false });
      const R = d.rooms, s = d.summary;
      const rec = {
        set: set.key, task: t, step, writers: [writer(pa), writer(pb)],
        elements: { before: s.before, after: s.after, byGlobalId: s.byGlobalId, byTag: s.byTag, byGeometry: s.byGeometry, unchanged: s.unchanged, changed: s.changed, added: s.added, removed: s.removed, replacedInPlace: s.replacedInPlace },
        rooms: { before: R.summary.before, after: R.summary.after, byGlobalId: R.summary.byGlobalId, byName: R.summary.byName, byGeometry: R.summary.byGeometry, unchanged: R.summary.unchanged, changed: R.summary.changed, added: R.summary.added, removed: R.summary.removed, split: R.summary.split, merged: R.summary.merged },
        lostRooms: { before: lost(old), after: lost(R) },
        lines: [
          ...R.changed.map((c) => `room changed${c.how === "geometry" ? " (renamed, new GlobalId)" : c.how === "name" ? " (new GlobalId)" : ""}: ${label(c.b)}: ${roomChangeText(c, { short: true })}`),
          ...R.groups.map((g) => `room ${g.kind}: ${g.before.map(label).join(" + ")} -> ${g.after.map(label).join(" + ")} (${g.floorAreaBefore.toFixed(2)} -> ${g.floorAreaAfter.toFixed(2)} m2)`),
          ...R.carved.map((k) => `rooms carved from ${label(k.from.b)}: ${k.rooms.map(label).join(" + ")} (${k.floorAreaCarved.toFixed(2)} of the ${k.floorAreaLost.toFixed(2)} m2 it lost)`),
          ...R.added.map((r) => `room added: ${label(r)}`),
          ...R.removed.map((r) => `room removed: ${label(r)}`),
          ...d.changed.slice(0, 6).map((c) => `element ${c.how === "place" ? "replaced in place" : "changed"}: ${c.b.ifcClass} ${c.b.name ?? ""} (${[...Object.keys(c.quantities), ...Object.keys(c.attributes), c.moved ? "moved" : "", c.reshaped ? "reshaped" : ""].filter(Boolean).join(", ")})`),
          ...(d.changed.length > 6 ? [`... ${d.changed.length - 6} more elements changed`] : []),
        ],
      };
      out.push(rec);
      const k = step;
      T[k] ??= { pairs: 0, elements: 0, elementsByGlobalId: 0, elementsChanged: 0, elementsAdded: 0, elementsRemoved: 0, rooms: 0, roomsMatched: 0, renamed: 0, split: 0, merged: 0, lostBefore: 0, lostAfter: 0 };
      const x = T[k];
      x.pairs++; x.elements += s.before; x.elementsByGlobalId += s.byGlobalId; x.elementsChanged += s.changed; x.elementsAdded += s.added; x.elementsRemoved += s.removed;
      x.rooms += R.summary.before; x.roomsMatched += R.summary.matched; x.renamed += R.changed.filter((c) => c.how === "geometry").length;
      x.split += R.summary.split; x.merged += R.summary.merged; x.lostBefore += rec.lostRooms.before; x.lostAfter += rec.lostRooms.after;
      console.log(`${set.key} ${t} ${step} [${rec.writers.join(" -> ")}]: elements ${s.before} -> ${s.after} (${s.byGlobalId} by GlobalId, ${s.byTag} Tag, ${s.byGeometry} geometry; ${s.changed} changed, ${s.added} added, ${s.removed} removed); rooms ${R.summary.before} -> ${R.summary.after}; lost rooms ${rec.lostRooms.before} -> ${rec.lostRooms.after}`);
      for (const l of rec.lines) console.log(`    ${l}`);
    }
  }
}
console.log("");
for (const [set, steps] of Object.entries(tot)) for (const [step, x] of Object.entries(steps)) {
  console.log(`${set} ${step}: ${x.pairs} pairs; elements ${x.elements} before, ${x.elementsByGlobalId} kept their GlobalId, ${x.elementsChanged} changed, ${x.elementsAdded} added, ${x.elementsRemoved} removed; rooms ${x.rooms} before, ${x.roomsMatched} matched (${x.renamed} renamed under a new GlobalId), ${x.split} split, ${x.merged} merged; rooms reported only as removed or added: ${x.lostBefore} before this change, ${x.lostAfter} after`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ totals: tot, pairs: out }, null, 1));
