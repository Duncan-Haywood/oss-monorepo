// How well the COBie export puts a component in its room from geometry,
// measured against what the files themselves say.
//
//   node eval/cobie-placement.mjs MODEL.ifc ... [--json OUT.json]
//
// Two truths, both written by the authoring tool:
//  A. Doors and windows: the IfcSpace each IfcRelSpaceBoundary pairs it
//     with. Predicted: openingSides() alone (the two sides of its body tested
//     against each room's solid), the boundaries never consulted.
//  B. Other maintainable components (cobie.mjs isAsset) the file contains in
//     an IfcSpace. Predicted: the containment hidden, assignRooms() places the
//     element by where its body stands.
// Then the full export on each file: rows per sheet, notes, time, and the
// QC's error and warning counts (design stage).
import { readFileSync, writeFileSync } from "node:fs";
import { parseModel } from "../node.mjs";
import { cobieFromModel, cobieQc, isAsset, placementFromTakeoff, numberRows, SHEETS } from "../cobie.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { roomTests, openingSides, assignRooms } from "../../ifc-quantity-takeoff/rooms.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && i !== jsonAt + 1);
const results = [];

for (const f of files) {
  const name = f.split("/").pop();
  const r = { file: name };
  try {
    const bytes = readFileSync(f);
    const t0 = Date.now();
    const model = parseModel(bytes);
    const t1 = Date.now();
    const tk = takeoff(parseStep(bytes.toString("utf8")));
    const t2 = Date.now();
    const roomById = new Map(tk.rooms.map((x) => [x.id, x]));
    const rowById = new Map(tk.rows.map((x) => [x.id, x]));

    // A. doors and windows against the file's space boundaries
    const truthA = new Map();
    for (const e of model.entities.values()) {
      if (!e.type.startsWith("IFCRELSPACEBOUNDARY")) continue;
      const sp = model.get(model.attr(e, "RelatingSpace"));
      const el = model.get(model.attr(e, "RelatedBuildingElement"));
      if (!sp || !el || !/^IFC(DOOR|WINDOW)$/.test(el.type) || sp.type !== "IFCSPACE") continue;
      if (!truthA.has(el.id)) truthA.set(el.id, new Set());
      truthA.get(el.id).add(sp.id);
    }
    const tests = roomTests(tk.rooms);
    const A = { checked: 0, same: 0, subset: 0, superset: 0, differ: 0, none: 0, noBody: 0 };
    for (const [id, truth] of truthA) {
      const row = rowById.get(id);
      if (!row || !row.computed?.solids?.body) { A.noBody++; continue; }
      A.checked++;
      const pred = new Set(openingSides(row, tests).map((x) => x.id));
      const inter = [...pred].filter((x) => truth.has(x)).length;
      if (!pred.size) A.none++;
      else if (inter === pred.size && inter === truth.size) A.same++;
      else if (inter === pred.size) A.subset++;
      else if (inter === truth.size) A.superset++;
      else A.differ++;
    }
    r.doorsWindows = A;

    // B. contained assets, containment hidden
    const B = { checked: 0, same: 0, other: 0, none: 0 };
    const hidden = [];
    for (const row of tk.rows) {
      if (row.spaceFrom !== "contained" || row.isAssembly) continue;
      const e = model.entities.get(row.id);
      if (!e || !isAsset(model, e) || /^IFC(DOOR|WINDOW)/.test(e.type)) continue;
      hidden.push({ row, truth: row.space });
    }
    const copies = hidden.map(({ row }) => Object.assign(Object.create(Object.getPrototypeOf(row)), row, { space: null, spaceFrom: null }));
    assignRooms(copies, tk.rooms.map((x) => x)); // counts on rooms change; not read below
    const byClass = {};
    hidden.forEach(({ row, truth }, i) => {
      B.checked++;
      const got = copies[i].space;
      const k = (byClass[row.ifcType] ||= { same: 0, other: 0, none: 0, noBox: 0 });
      if (!row.box) k.noBox++;
      if (!got) { B.none++; k.none++; }
      else if (got === truth) { B.same++; k.same++; }
      else { B.other++; k.other++; }
    });
    B.byClass = byClass;
    r.containedAssets = B;

    // The export with geometry, and its QC
    const placement = placementFromTakeoff(tk);
    const c = numberRows(cobieFromModel(model, { placement }));
    const t3 = Date.now();
    const qc = cobieQc(c.sheets);
    r.rows = Object.fromEntries(SHEETS.map((s) => [s, c.sheets[s].length]));
    r.notes = c.notes;
    r.qc = { errors: qc.errors, warnings: qc.warnings };
    r.ms = { parse: t1 - t0, takeoff: t2 - t1, export: t3 - t2 };
    void roomById;
  } catch (e) {
    r.error = String(e && e.stack || e).split("\n").slice(0, 3).join(" | ");
  }
  results.push(r);
  const d = r.doorsWindows, b = r.containedAssets;
  console.log(`${name}: ${r.error ? "ERROR " + r.error : `rows ${SHEETS.map((s) => r.rows[s]).join("/")}; doors+windows vs boundaries ${d.same}/${d.checked} same, ${d.subset} one side of two, ${d.superset} extra, ${d.differ} differ, ${d.none} none; contained assets ${b.same}/${b.checked} same, ${b.other} other, ${b.none} none; QC ${r.qc.errors} errors ${r.qc.warnings} warnings; ${r.ms.parse}+${r.ms.takeoff}+${r.ms.export} ms`}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1) + "\n");
