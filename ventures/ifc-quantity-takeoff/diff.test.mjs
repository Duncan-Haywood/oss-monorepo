import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff } from "./qto.mjs";
import { diffTakeoffs, boqDelta, boqDeltaCsv, changesCsv } from "./diff.mjs";

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
