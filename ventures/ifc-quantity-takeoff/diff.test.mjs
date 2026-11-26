import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff } from "./qto.mjs";
import { diffTakeoffs, diffRooms, roomChangeText, boqDelta, boqDeltaCsv, changesCsv } from "./diff.mjs";

const load = (name) => takeoff(parseStep(readFileSync(new URL(`./samples/${name}`, import.meta.url)))).rows;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// samples/make-revision.mjs lists each change and its hand arithmetic
test("the sample revision: one change of each kind, worked by hand", () => {
  const d = diffTakeoffs(load("sample-office.ifc"), load("sample-office-rev2.ifc"));
  assert.deepEqual(
    { before: d.summary.before, after: d.summary.after, byGlobalId: d.summary.byGlobalId, byTag: d.summary.byTag, byGeometry: d.summary.byGeometry, unchanged: d.summary.unchanged, changed: d.summary.changed, added: d.summary.added, removed: d.summary.removed },
    { before: 7, after: 7, byGlobalId: 5, byTag: 1, byGeometry: 0, unchanged: 3, changed: 3, added: 1, removed: 1 },
  );
  const by = (name) => d.changed.find((c) => c.b.name === name);
  // Wall A: door 1000 -> 1200 wide; box unchanged
  const a = by("Wall A");
  near(a.quantities.volume.delta, -1.2 * 0.2 * 2.1 + 1.0 * 0.2 * 2.1);
  near(a.quantities.area.after, 12.48);
  assert.equal(a.moved, null);
  assert.equal(a.reshaped, null);
  // Slab: 250 -> 300 thick: +1 m3, its box 50 mm deeper, not moved
  const s = by("Floor slab");
  near(s.quantities.volume.delta, 1.0);
  near(s.reshaped.after[2] - s.reshaped.before[2], 0.05);
  assert.equal(s.moved, null);
  // Beam: moved 1 m along y, same quantities
  const b = by("Beam IPE 200");
  assert.deepEqual(b.quantities, {});
  near(b.moved.distance, 1.0);
  near(b.moved.by[1], 1.0);
  // Column: new GlobalId, same Tag: matched, unchanged
  const col = d.unchanged.find((c) => c.how === "tag");
  assert.equal(col.b.globalId, "2Rev2ColumnReExport001");
  assert.equal(col.a.tag, "4001");
  assert.equal(d.added[0].globalId, "2Rev2ColumnAdded000002");
  assert.equal(d.removed[0].name, "Wall B");
});

test("a model against itself has no changes", () => {
  const rows = load("sample-office.ifc");
  const d = diffTakeoffs(rows, load("sample-office.ifc"));
  assert.equal(d.summary.unchanged, rows.length);
  assert.equal(d.changed.length + d.added.length + d.removed.length + d.groups.length, 0);
  assert.equal(changesCsv(d).trim().split("\r\n").length, 1, "only the header");
});

test("the bill-of-quantities change, with rates", () => {
  const A = load("sample-office.ifc"), B = load("sample-office-rev2.ifc");
  const key = JSON.stringify(["IfcWall", "Basic Wall 200"]);
  const lines = boqDelta(A, B, ["class", "type"], { [key]: { rate: 100, unit: "m3" } });
  const wall = lines.find((l) => JSON.stringify(l.key) === key);
  // Wall B (2.0 m3 stored) gone, Wall A net 2.58 -> 2.496; the split Wall C
  // pieces sum their computed 1.8 m3 each both times
  assert.equal(wall.delta.count, -1);
  near(wall.delta.volume, -2.0 - 0.084);
  near(wall.amount.delta, 100 * (-2.084));
  const col = lines.find((l) => l.key[0] === "IfcColumn");
  near(col.delta.volume, Math.PI * 0.15 ** 2 * 3);
  const csv = boqDeltaCsv(lines, ["class", "type"]);
  assert.match(csv, /IfcColumn/);
  assert.doesNotMatch(csv, /IfcBeam/, "unchanged lines are left out by default");
  assert.match(boqDeltaCsv(lines, ["class", "type"], { all: true }), /IfcBeam/);
});

// Rows built by hand, the shape takeoff() returns, for the matching rules
const row = (o) => ({ globalId: o.g, ifcClass: o.cls ?? "IfcSlab", tag: o.tag ?? null, name: o.name ?? o.g, type: null, storey: o.storey ?? "L1", material: null, classification: null, isAssembly: false, stored: {}, computed: { status: "ok", gross: o.v, net: o.v }, box: o.box ?? null });

test("Revit parts in one revision and their host in the next: merged, then split", () => {
  const host = row({ g: "HOST", cls: "IfcSlab", v: 3.0, box: [0, 0, -0.3, 5, 4, 0] });
  // three layers, a few mm proud of the host's box at one edge, volumes
  // summing 0.5% under the host's (the join clean-up differs)
  const parts = [
    row({ g: "P1", cls: "IfcRoof", v: 0.5, box: [0, 0, -0.05, 5.004, 4, 0] }),
    row({ g: "P2", cls: "IfcRoof", v: 2.0, box: [0, 0, -0.25, 5, 4, -0.05] }),
    row({ g: "P3", cls: "IfcRoof", v: 0.485, box: [0, 0, -0.3, 5, 4, -0.25] }),
  ];
  const unrelated = row({ g: "CHAIR", cls: "IfcFurnishingElement", v: 0.01, box: [1, 1, 0, 1.5, 1.5, 0.9] });
  const m = diffTakeoffs([...parts, unrelated], [host, unrelated]);
  assert.equal(m.groups.length, 1);
  assert.equal(m.groups[0].kind, "merged");
  assert.deepEqual(m.groups[0].before.map((r) => r.globalId).sort(), ["P1", "P2", "P3"]);
  assert.equal(m.added.length + m.removed.length, 0);
  const s = diffTakeoffs([host], parts);
  assert.equal(s.groups[0].kind, "split");
  // a group whose volumes do not add up is left as added and removed
  const off = diffTakeoffs([row({ g: "HOST", v: 4.0, box: host.box })], parts);
  assert.equal(off.groups.length, 0);
  assert.equal(off.added.length, 3);
  // nor across storeys
  const other = diffTakeoffs([row({ g: "HOST", v: 3.0, box: host.box, storey: "L2" })], parts);
  assert.equal(other.groups.length, 0);
});

test("Tag matches only when unique in both revisions; geometry matches only one candidate", () => {
  const a = [row({ g: "A1", cls: "IfcDoor", tag: "7", v: 0.1 }), row({ g: "A2", cls: "IfcDoor", tag: "7", v: 0.1 })];
  const b = [row({ g: "B1", cls: "IfcDoor", tag: "7", v: 0.1 }), row({ g: "B2", cls: "IfcDoor", tag: "7", v: 0.1 })];
  const d = diffTakeoffs(a, b);
  assert.equal(d.summary.byTag, 0);
  assert.equal(d.summary.byGeometry, 0, "no boxes, no geometry match");
  // the same Tag in another class is another element
  const c = diffTakeoffs([row({ g: "A", cls: "IfcDoor", tag: "9", v: 0.1 })], [row({ g: "B", cls: "IfcWindow", tag: "9", v: 0.1 })]);
  assert.equal(c.summary.byTag, 0);
  // geometry: one wall re-exported with no Tag, the same box and volume
  const box = [0, 0, 0, 4, 0.2, 3];
  const g = diffTakeoffs([row({ g: "W1", name: "Wall", cls: "IfcWall", v: 2.4, box })], [row({ g: "W2", name: "Wall", cls: "IfcWall", v: 2.4, box: box.map((x) => x + 0.003) })]);
  assert.equal(g.summary.byGeometry, 1);
  assert.equal(g.unchanged.length, 1);
  // two identical candidates: ambiguous, so not matched
  const two = diffTakeoffs([row({ g: "W1", cls: "IfcWall", v: 2.4, box })], [row({ g: "W2", cls: "IfcWall", v: 2.4, box }), row({ g: "W3", cls: "IfcWall", v: 2.4, box })]);
  assert.equal(two.summary.byGeometry, 0);
});

test("a GlobalId repeated in a file pairs with the element of its own class", () => {
  // HHS construction2.ifc: the column took the slab's GlobalId; the column is
  // written last here, so keeping the last row per GlobalId would pair the
  // slab with the column
  const a = [row({ g: "SLAB", cls: "IfcSlab", v: 9 }), row({ g: "COL", cls: "IfcColumn", tag: "573295", v: 0.2 })];
  const b = [row({ g: "SLAB", cls: "IfcSlab", v: 9 }), row({ g: "SLAB", cls: "IfcColumn", tag: "573295", name: "COL", v: 0.2 })];
  const d = diffTakeoffs(a, b);
  assert.equal(d.summary.duplicateGlobalIds.after, 1);
  assert.equal(d.summary.byGlobalId, 1);
  assert.equal(d.summary.byTag, 1);
  assert.equal(d.changed.length, 0);
});

test("the change CSV neutralises a name that starts a spreadsheet formula", () => {
  const d = diffTakeoffs([], [row({ g: "X", name: "=HYPERLINK(\"http://x\")", v: 1 })]);
  const csv = changesCsv(d);
  assert.match(csv, /"'=HYPERLINK/);
});

test("a window deleted and placed again (new GlobalId and Tag): replaced in place, not removed and added", () => {
  // Lake Kegonsa Home, 2014-10-21 -> 10-23: Andersen casements re-placed 22 mm
  // lower, a double-hung swapped for a shorter casement in the same opening
  const w = (g, tag, type, v, box) => ({ ...row({ g, cls: "IfcWindow", tag, v, box, storey: "3rd Floor" }), type });
  const a = [
    w("A1", "369345", "Casement 31-1/2 x 59-7/8", 0.07774, [6.459, 12.307, 2.692, 7.539, 12.508, 4.493]),
    w("A2", "144703", "Double hung 33-5/8 x 48-7/8", 0.06988, [3.632, 6.511, 3.010, 3.835, 7.646, 4.455]),
    w("A3", "144701", "Double hung 33-5/8 x 48-7/8", 0.06988, [3.585, 4.531, 3.010, 3.788, 5.665, 4.455]),
  ];
  const b = [
    w("B1", "971146", "Casement 31-1/2 x 59-7/8", 0.07774, [6.405, 12.309, 2.670, 7.485, 12.510, 4.470]),
    w("B2", "965978", "Casement 31-1/2 x 48", 0.06700, [3.632, 6.505, 2.972, 3.833, 7.585, 4.470]),
    // A3's replacement went a metre along the wall: not the same place
    w("B3", "965849", "Casement 31-1/2 x 48", 0.06700, [3.610, 5.581, 2.972, 3.811, 6.662, 4.470]),
  ];
  const d = diffTakeoffs(a, b);
  assert.equal(d.summary.replacedInPlace, 2);
  assert.equal(d.summary.byTag + d.summary.byGeometry, 0, "not the same element");
  assert.deepEqual(d.removed.map((r) => r.globalId), ["A3"]);
  assert.deepEqual(d.added.map((r) => r.globalId), ["B3"]);
  const swap = d.changed.find((c) => c.b.globalId === "B2");
  assert.equal(swap.how, "place");
  assert.deepEqual(swap.attributes.type, { before: "Double hung 33-5/8 x 48-7/8", after: "Casement 31-1/2 x 48" });
  // same type, nothing measurable changed but the 22 mm drop: still listed, as a new element
  const same = d.changed.find((c) => c.b.globalId === "B1");
  assert.equal(same.how, "place");
  assert.match(changesCsv(d), /replaced in place,A1,B1,IfcWindow/);
  // another storey, another class, or two candidates: not paired
  assert.equal(diffTakeoffs([a[0]], [{ ...b[0], storey: "2nd Floor" }]).summary.replacedInPlace, 0);
  assert.equal(diffTakeoffs([a[0]], [{ ...b[0], ifcClass: "IfcDoor" }]).summary.replacedInPlace, 0);
  assert.equal(diffTakeoffs([a[0]], [b[0], { ...b[0], globalId: "B1b" }]).summary.replacedInPlace, 0);
  // off when asked
  assert.equal(diffTakeoffs(a, b, { placeOverlap: 0 }).summary.replacedInPlace, 0);
});

test("a host and one of its layers are not 'replaced in place'", () => {
  const host = row({ g: "HOST", cls: "IfcWall", v: 3.0, box: [0, 0, 0, 5, 0.3, 3] });
  // the core layer fills two thirds of the host's box; the volumes don't sum, so no group either
  const core = row({ g: "CORE", cls: "IfcWall", v: 2.6, box: [0, 0.05, 0, 5, 0.25, 3] });
  const skin = row({ g: "SKIN", cls: "IfcWall", v: 0.2, box: [0, 0.25, 0, 5, 0.3, 3] });
  assert.equal(diffTakeoffs([host], [core, skin]).summary.replacedInPlace, 0, "a second layer centred in the host");
  // alone, a layer of 2.0 against a host of 3.0 is too far off in volume
  assert.equal(diffTakeoffs([host], [row({ g: "C2", cls: "IfcWall", v: 2.0, box: [0, 0.05, 0, 5, 0.25, 3] })]).summary.replacedInPlace, 0);
});

test("a storey renamed under its own GlobalId is listed once, not as a change to every element on it; a type renamed stays a change", () => {
  // Tulpstraat (BlenderBIM), 2024-02-10 -> 02-15: "My Storey" renamed
  // "00_begane_grond" and the wall type "TYPEX" renamed "buitengevel", same
  // GlobalIds; the interior walls were given a new type
  const r = (g, o = {}) => ({ ...row({ g, cls: o.cls ?? "IfcWall", v: o.v ?? 1, box: o.box ?? [0, 0, 0, 1, 1, 1], storey: o.storey ?? "My Storey" }), storeyGlobalId: o.sg ?? "S0", type: o.type ?? null, typeGlobalId: o.tg ?? null });
  const a = [r("W1", { type: "TYPEX", tg: "T0" }), r("W2", { type: "TYPEX", tg: "T0" }), r("WIN", { cls: "IfcWindow" }), r("B1", { cls: "IfcBeam" })];
  const b = [
    r("W1", { type: "buitengevel", tg: "T0", storey: "00_begane_grond" }),
    r("W2", { type: "binnenwanden_50mm", tg: "T1", storey: "00_begane_grond" }),
    r("WIN", { cls: "IfcWindow", storey: "00_begane_grond" }),
    // the beam's storey has a new GlobalId under the old name
    r("B1", { cls: "IfcBeam", storey: "My Storey", sg: "S1" }),
  ];
  const d = diffTakeoffs(a, b);
  assert.deepEqual(d.renames.storey, [{ globalId: "S0", before: "My Storey", after: "00_begane_grond", elements: 3 }]);
  assert.deepEqual(d.renames.type, [{ globalId: "T0", before: "TYPEX", after: "buitengevel", elements: 1 }]);
  assert.deepEqual(d.unchanged.map((c) => c.b.globalId).sort(), ["B1", "WIN"]);
  assert.equal(d.summary.renamedOnly, 1);
  assert.deepEqual(d.unchanged.find((c) => c.b.globalId === "WIN").renamed, { storey: { before: "My Storey", after: "00_begane_grond" } });
  // Revit keeps a type's GlobalId when the type is re-specified, so a type
  // rename is still a type change, labelled as the same type object
  const w1 = d.changed.find((c) => c.b.globalId === "W1");
  assert.deepEqual(w1.attributes, { type: { before: "TYPEX", after: "buitengevel", sameTypeObject: true } });
  assert.deepEqual(w1.renamed, { storey: { before: "My Storey", after: "00_begane_grond" } });
  assert.match(changesCsv(d), /type: TYPEX -> buitengevel \(same type GlobalId: renamed or re-specified\)/);
  const w2 = d.changed.find((c) => c.b.globalId === "W2");
  assert.deepEqual(w2.attributes, { type: { before: "TYPEX", after: "binnenwanden_50mm" } }, "a new type is a change; the storey rename is not");
  const b1 = d.changed.find((c) => c.b.globalId === "B1");
  assert.equal(b1, undefined, "same storey name, new storey GlobalId: not a change (a re-export may regenerate it)");
  assert.equal(d.summary.storeysRenamed, 1);
  assert.equal(d.summary.typesRenamed, 1);
  const csv = changesCsv(d);
  assert.match(csv, /storey renamed,S0,S0,IfcBuildingStorey,00_begane_grond,,00_begane_grond,same GlobalId,name: My Storey -> 00_begane_grond \(3 elements; not counted as changed\)/);
  assert.match(csv, /type renamed,T0,T0/);
  // rows without the storey's GlobalId (an older takeoff) compare by name, as before
  const strip = (x) => ({ ...x, storeyGlobalId: null, typeGlobalId: null });
  const old = diffTakeoffs(a.map(strip), b.map(strip));
  assert.equal(old.summary.storeysRenamed, 0);
  assert.equal(old.changed.find((c) => c.b.globalId === "WIN").attributes.storey.after, "00_begane_grond");
  assert.equal(old.changed.find((c) => c.b.globalId === "W1").attributes.type.sameTypeObject, undefined);
});

test("a storey name moved to another GlobalId is a change; a regenerated GlobalId under the same name is not", () => {
  const r = (g, sg, storey) => ({ ...row({ g, cls: "IfcBeam", v: 1, box: [0, 0, 0, 1, 1, 1], storey }), storeyGlobalId: sg });
  // the beam's storey S0 was renamed L2 while it moved to S1, named L1: a storey change, not a rename
  const d = diffTakeoffs([r("B", "S0", "L1")], [r("B", "S1", "L1x")]);
  assert.deepEqual(d.changed[0].attributes.storey, { before: "L1", after: "L1x" });
  assert.deepEqual(d.renames.storey, []);
  // re-exported with new storey GlobalIds, names kept: nothing changed
  assert.equal(diffTakeoffs([r("B", "S0", "L1")], [r("B", "S9", "L1")]).summary.changed, 0);
});

test("replaced in place pairs across a renamed storey", () => {
  const w = (g, storey, box) => ({ ...row({ g, cls: "IfcWindow", v: 0.07, box, storey }), storeyGlobalId: "S0" });
  const d = diffTakeoffs([w("A", "My Storey", [0, 0, 0, 1, 0.2, 1.5])], [w("B", "00_begane_grond", [0, 0, -0.02, 1, 0.2, 1.48])]);
  assert.equal(d.summary.replacedInPlace, 1);
});

test("renames read from the file: the storey's and type's GlobalIds come through the takeoff", () => {
  const src = readFileSync(new URL("./samples/sample-office.ifc", import.meta.url), "latin1");
  const renamed = src.replace("IFCBUILDINGSTOREY('12OnscnIBCIL_UNHcL4B_o',$,'Level 1'", "IFCBUILDINGSTOREY('12OnscnIBCIL_UNHcL4B_o',$,'00 Ground floor'").replace("IFCWALLTYPE('1bNX7RDrbCpuXgosCTwZgn',$,'Basic Wall 200'", "IFCWALLTYPE('1bNX7RDrbCpuXgosCTwZgn',$,'Exterior 200'");
  assert.notEqual(renamed, src);
  const a = load("sample-office.ifc"), b = takeoff(parseStep(Buffer.from(renamed, "latin1"))).rows;
  const d = diffTakeoffs(a, b);
  // the walls of the renamed type are listed as type changes; nothing else
  assert.ok(d.changed.length > 0 && d.changed.every((c) => Object.keys(c.attributes).join() === "type" && c.attributes.type.sameTypeObject && !Object.keys(c.quantities).length));
  assert.equal(d.renames.storey[0].after, "00 Ground floor");
  assert.equal(d.renames.type[0].after, "Exterior 200");
  assert.ok(d.summary.renamedOnly > 0);
});

test("a material renamed in place is told by its STEP id, only when the file kept its ids; swaps are grouped", () => {
  // Tulpstraat (BlenderBIM), 2024-02-15 -> 02-19: IfcMaterial #67 'Unknown'
  // renamed 'baksteen' and its layer set #68 given the name 'brick'; no wall
  // was given another material
  const m = (g, id, o = {}) => ({ ...row({ g, cls: "IfcWall", v: o.v ?? 1, box: [0, 0, 0, 1, 1, 1] }), id, material: o.material, materialRef: o.ref ?? 76, materialSet: o.set === undefined ? { id: 68, kind: "IFCMATERIALLAYERSET", name: null } : o.set, materialParts: o.parts ?? [{ id: 67, name: "Unknown" }] });
  const a = [m("W1", 10, { material: "Unknown" }), m("W2", 11, { material: "Unknown" }), m("W3", 12, { material: "Unknown", v: 2 }), m("W4", 13, { material: "Unknown", ref: 67, set: null })];
  const after = { set: { id: 68, kind: "IFCMATERIALLAYERSET", name: "brick" }, parts: [{ id: 67, name: "baksteen" }] };
  const b = [
    m("W1", 10, { material: "brick", ...after }),
    m("W2", 11, { material: "brick", ...after }),
    // W3 given another layer set: a re-specification, not a rename
    m("W3", 12, { material: "Kalkzandsteen", v: 2, ref: 90, set: { id: 91, kind: "IFCMATERIALLAYERSET", name: "Kalkzandsteen" }, parts: [{ id: 92, name: "Kalkzandsteen" }] }),
    m("W4", 13, { material: "baksteen", ref: 67, set: null, parts: [{ id: 67, name: "baksteen" }] }),
  ];
  const d = diffTakeoffs(a, b);
  assert.equal(d.materialIdsKept, true);
  assert.deepEqual(d.renames.material, [
    { entityId: 67, entity: "IfcMaterial", before: "Unknown", after: "baksteen", elements: 3 },
    { entityId: 68, entity: "IfcMaterialLayerSet", before: null, after: "brick", elements: 2 },
  ]);
  // like a type, a material name is the specification: still a change, marked
  assert.equal(d.summary.changed, 4);
  assert.equal(d.changed.find((c) => c.b.globalId === "W1").attributes.material.sameMaterialEntity, true);
  assert.equal(d.changed.find((c) => c.b.globalId === "W4").attributes.material.sameMaterialEntity, true);
  assert.equal(d.changed.find((c) => c.b.globalId === "W3").attributes.material.sameMaterialEntity, undefined);
  assert.deepEqual(d.materialSwaps.map((s) => [s.before, s.after, s.elements, s.renamedInPlace, s.volume]), [["Unknown", "brick", 2, 2, 2], ["Unknown", "baksteen", 1, 1, 1], ["Unknown", "Kalkzandsteen", 1, 0, 2]]);
  assert.equal(d.summary.materialsRenamed, 2);
  assert.equal(d.summary.materialSwaps, 3);
  const csv = changesCsv(d);
  assert.match(csv, /material renamed,#67,#67,IfcMaterial,baksteen,,,same STEP id \(file edited in place\),name: Unknown -> baksteen \(3 elements; each still listed as a material change\)/);
  assert.match(csv, /material swap,,,IfcWall,,,,same material entity,material: Unknown -> brick \(2 elements\)/);
  assert.match(csv, /material: Unknown -> brick \(same material entity, renamed\)/);
  // a re-export renumbers the file (Revit: 0 to 2% of matched elements keep
  // their STEP id on the Aalseth series): the same ids mean nothing, so no
  // rename is claimed and no change is marked
  const renumbered = b.map((r, i) => ({ ...r, id: 500 + i }));
  const e = diffTakeoffs(a, renumbered);
  assert.equal(e.materialIdsKept, false);
  assert.deepEqual(e.renames.material, []);
  assert.ok(e.changed.every((c) => !c.attributes.material.sameMaterialEntity));
  assert.equal(e.materialSwaps.length, 3);
});

test("a material renamed in the file comes through the takeoff", () => {
  const src = readFileSync(new URL("./samples/sample-office.ifc", import.meta.url), "latin1");
  const renamed = src.replace("#70=IFCMATERIAL('Concrete C30/37'", "#70=IFCMATERIAL('Concrete C35/45'");
  assert.notEqual(renamed, src);
  const a = load("sample-office.ifc"), b = takeoff(parseStep(Buffer.from(renamed, "latin1"))).rows;
  const d = diffTakeoffs(a, b);
  assert.equal(d.materialIdsKept, true);
  assert.equal(d.renames.material.length, 1);
  assert.deepEqual([d.renames.material[0].entityId, d.renames.material[0].before, d.renames.material[0].after], [70, "Concrete C30/37", "Concrete C35/45"]);
  const n = a.filter((r) => !r.isAssembly && (r.material || "").includes("Concrete C30/37")).length;
  assert.ok(n > 0);
  assert.equal(d.renames.material[0].elements, n);
  assert.ok(d.changed.length === n && d.changed.every((c) => c.attributes.material?.sameMaterialEntity && Object.keys(c.attributes).length === 1));
  assert.equal(d.materialSwaps.reduce((t, s) => t + s.renamedInPlace, 0), n);
});

// rooms: the sample office plus a 4 x 3 m room on Level 1; the later
// revision gives it a property set, adds a second room and widens nothing else
const sampleText = () => readFileSync(new URL("./samples/sample-office.ifc", import.meta.url), "latin1");
const roomText = (id, gid, number, w, extra = []) => [
  `#${id}=IFCSPACE('${gid}',$,'${number}',$,$,#${id + 1},#${id + 2},'Office',.ELEMENT.,.INTERNAL.,$);`,
  `#${id + 1}=IFCLOCALPLACEMENT(#51,#21);`,
  `#${id + 2}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${id + 3}));`,
  `#${id + 3}=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#${id + 4}));`,
  `#${id + 4}=IFCEXTRUDEDAREASOLID(#${id + 5},#21,#23,2700.);`,
  `#${id + 5}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${id + 6},${w}.,3000.);`,
  `#${id + 6}=IFCAXIS2PLACEMENT2D(#${id + 7},$);`,
  `#${id + 7}=IFCCARTESIANPOINT((${2500 + id - 2000}.,1600.));`,
  `#${id + 8}=IFCRELAGGREGATES('${gid.slice(0, -1)}A',$,$,$,#50,(#${id}));`,
  ...extra,
];
const withRooms = (lines) => takeoff(parseStep(Buffer.from(sampleText().replace("ENDSEC;\nEND-ISO", `${lines.join("\n")}\nENDSEC;\nEND-ISO`), "latin1")));

test("rooms: added, given a property, resized, and matched under a new GlobalId", () => {
  const before = withRooms([...roomText(2000, "0rM000000000000000R101", "101", 4000), ...roomText(2100, "0rM000000000000000R102", "102", 2000)]);
  const after = withRooms([
    ...roomText(2000, "0rM000000000000000R101", "101", 4000, [
      "#2090=IFCPROPERTYSINGLEVALUE('Use',$,IFCTEXT('Print and copy'),$);",
      "#2091=IFCPROPERTYSET('0rM000000000000000P101',$,'Brief',$,(#2090));",
      "#2092=IFCRELDEFINESBYPROPERTIES('0rM000000000000000D101',$,$,$,(#2000),#2091);",
    ]),
    // 102 re-exported under a new GlobalId and made 0.5 m wider
    ...roomText(2100, "0rM000000000000000N102", "102", 2500),
    ...roomText(2200, "0rM000000000000000R103", "103", 1000),
  ]);
  assert.equal(after.rooms.find((r) => r.number === "101").properties["Brief.Use"], "Print and copy");
  const d = diffTakeoffs(before.rows, after.rows, { rooms: [before.rooms, after.rooms] });
  const R = d.summary.rooms;
  assert.deepEqual({ before: R.before, after: R.after, byGlobalId: R.byGlobalId, byName: R.byName, changed: R.changed, added: R.added, removed: R.removed, propertyChanged: R.propertyChanged, quantityChanged: R.quantityChanged },
    { before: 2, after: 3, byGlobalId: 1, byName: 1, changed: 2, added: 1, removed: 0, propertyChanged: 1, quantityChanged: 1 });
  const c101 = d.rooms.changed.find((c) => c.b.number === "101");
  assert.deepEqual(c101.properties["Brief.Use"], { before: null, after: "Print and copy", kind: "added" });
  assert.deepEqual(c101.quantities, {});
  const c102 = d.rooms.changed.find((c) => c.b.number === "102");
  assert.equal(c102.how, "name");
  near(c102.quantities.floorArea.delta, 0.5 * 3);
  assert.equal(roomChangeText(c101, { short: true }), "Use added: Print and copy");
  assert.equal(d.rooms.added[0].number, "103");
  // the elements are untouched
  assert.equal(d.summary.changed + d.summary.added + d.summary.removed, 0);
  const csv = changesCsv(d);
  assert.match(csv, /room changed,0rM000000000000000R101,0rM000000000000000R101,IfcSpace,101 Office,,Level 1,,Brief\.Use added: Print and copy/);
  assert.match(csv, /room added,,0rM000000000000000R103,IfcSpace,103 Office/);
  // without room lists, as before
  assert.equal(diffTakeoffs(before.rows, after.rows).rooms, null);
  // a model's rooms against themselves: nothing
  assert.equal(diffRooms(after.rooms, after.rooms).summary.changed, 0);
});

test("red team 2026-11-26: class change under one GlobalId, the group tolerance is inclusive, a removed room property, unset GlobalIds", () => {
  // the one element under a GlobalId pairs even when its class changed (IfcWall -> IfcWallStandardCase)
  const cls = diffTakeoffs([row({ g: "W1", cls: "IfcWall", v: 1 })], [row({ g: "W1", cls: "IfcWallStandardCase", v: 1 })]);
  assert.equal(cls.summary.byGlobalId, 1);
  assert.deepEqual(cls.changed[0].attributes.class, { before: "IfcWall", after: "IfcWallStandardCase" });
  // two later elements of other classes under that GlobalId: no guess
  const two = diffTakeoffs([row({ g: "W1", cls: "IfcWall", v: 1 })], [row({ g: "W1", cls: "IfcSlab", v: 1 }), row({ g: "W1", cls: "IfcColumn", v: 1 })]);
  assert.equal(two.summary.byGlobalId, 0);
  // parts summing exactly groupTol away from the host still merge (0.5 + 0.5 against 0.75: 0.25 of 1)
  const parts = [row({ g: "P1", v: 0.5, box: [0, 0, 0, 1, 1, 0.5] }), row({ g: "P2", v: 0.5, box: [0, 0, 0.5, 1, 1, 1] })];
  const host = row({ g: "H", v: 0.75, box: [0, 0, 0, 1, 1, 1] });
  assert.equal(diffTakeoffs(parts, [host], { groupTol: 0.25 }).summary.merged, 1);
  assert.equal(diffTakeoffs(parts, [host], { groupTol: 0.24 }).summary.merged, 0);
  // a room property removed reads as removed, not as a change to (empty)
  const rc = { attributes: {}, quantities: {}, properties: { "Brief.Use": { before: "Print", after: null, kind: "removed" }, "Brief.Finish": { before: "A", after: "B", kind: "changed" } } };
  assert.equal(roomChangeText(rc, { short: true }), "Use removed (was Print); Finish: A -> B");
  // elements with an unset GlobalId ($) are not a repeated GlobalId
  const unset = [row({ g: null, v: 1, box: [0, 0, 0, 1, 1, 1] }), row({ g: null, v: 2, box: [5, 0, 0, 6, 1, 1] }), row({ g: "G3", v: 1 })];
  assert.deepEqual(diffTakeoffs(unset, unset).summary.duplicateGlobalIds, { before: 0, after: 0 });
});
