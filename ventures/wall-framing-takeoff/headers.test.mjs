import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, takeoff } from "./engine.mjs";
import { resolveHeaders, validateHeaderTable } from "./headers.mjs";
import { main } from "./cli.mjs";

// A made-up table for tests only (not a code table).
const table = [
  { upTo: 36, header: "2x6", plies: 2 },
  { upTo: 72, header: "2x10", plies: 2 },
  { upTo: 96, header: "2x12", plies: 3 },
];
const planWith = (extra = {}) => ({ ...samplePlan(), headerTable: table, ...extra });

test("auto openings take the first row whose span covers the width", () => {
  const plan = planWith();
  const w = plan.walls[0];
  w.openings = [
    { kind: "window", label: "A", offset: 48, width: 36, height: 48, header: "auto" },
    { kind: "window", label: "B", offset: 120, width: 37, height: 48 },
    { kind: "window", label: "C", offset: 240, width: 72, height: 48, header: "auto" },
  ];
  const r = resolveHeaders(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const [a, b, c] = r.plan.walls[0].openings;
  assert.deepEqual([a.header, a.headerPlies], ["2x6", 2]);
  assert.deepEqual([b.header, b.headerPlies], ["2x10", 2]); // 37 in is past the first row
  assert.deepEqual([c.header, c.headerPlies], ["2x10", 2]); // exactly on a row's limit
  assert.equal(plan.walls[0].openings[0].header, "auto"); // input untouched
  assert.ok(takeoff(r.plan).ok);
});

test("a hand-picked header lighter than the table is reported, a heavier one is not", () => {
  const plan = planWith();
  plan.walls[0].openings = [
    { kind: "window", label: "light", offset: 48, width: 60, height: 48, header: "2x6" },
    { kind: "window", label: "plies", offset: 140, width: 60, height: 48, header: "2x10", headerPlies: 1 },
    { kind: "window", label: "heavy", offset: 240, width: 30, height: 48, header: "2x12" },
    { kind: "window", label: "exact", offset: 320, width: 60, height: 48, header: "2x10" },
  ];
  plan.walls = [plan.walls[0]];
  const r = resolveHeaders(plan);
  assert.deepEqual(r.rows.map((x) => x.status), ["under", "under", "ok", "ok"]);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /lighter than your table's 2 x 2x10/);
});

test("a span past the table, and a bad table, are errors", () => {
  const plan = planWith();
  plan.walls[0].openings = [{ kind: "window", label: "wide", offset: 48, width: 120, height: 48, header: "auto" }];
  assert.match(resolveHeaders(plan).errors[0], /wider than the table's longest span/);
  assert.equal(validateHeaderTable([{ upTo: 36, header: "2x10" }, { upTo: 72, header: "2x6" }]).length, 1);
  assert.equal(validateHeaderTable([{ upTo: 0, header: "2x9" }]).length, 2);
  assert.equal(validateHeaderTable([]).length, 1);
});

test("2x6 walls default to three plies in the comparison", () => {
  const plan = planWith();
  plan.walls[0].stud = "2x6";
  plan.walls[0].openings = [{ kind: "window", label: "w", offset: 48, width: 30, height: 48, header: "auto" }];
  const r = resolveHeaders({ ...plan, headerTable: [{ upTo: 36, header: "2x6" }] });
  assert.equal(r.plan.walls[0].openings[0].headerPlies, 3);
});

test("the CLI sizes auto headers and prints the comparison", () => {
  const plan = planWith();
  plan.walls[0].openings = [
    { kind: "window", label: "A", offset: 48, width: 36, height: 48, header: "auto" },
    { kind: "window", label: "B", offset: 140, width: 60, height: 48, header: "2x6" },
  ];
  const res = main(["p.json", "--headers"], () => JSON.stringify(plan));
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /HEADERS/);
  assert.match(res.out, /\(from table\)/);
  assert.match(res.out, /UNDER/);
  const bad = main(["p.json"], () => JSON.stringify(plan)); // table present: auto still resolves without the flag
  assert.equal(bad.code, 0, bad.out);
});

test("a wall's own table, or one keyed by stud size, overrides the plan table", () => {
  const plan = planWith();
  const [w0, w1] = plan.walls;
  w0.openings = [{ kind: "window", label: "A", offset: 48, width: 36, height: 48, header: "auto" }];
  w1.openings = [{ kind: "window", label: "B", offset: 48, width: 36, height: 48, header: "auto" }];
  w0.headerTable = [{ upTo: 60, header: "2x8", plies: 2 }]; // wall-level override
  const r = resolveHeaders(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.plan.walls[0].openings[0].header, "2x8");
  assert.equal(r.plan.walls[1].openings[0].header, "2x6"); // plan table

  const p2 = planWith({ headerTables: { "2x4": [{ upTo: 96, header: "2x10", plies: 2 }] } });
  p2.walls[0].stud = "2x4";
  p2.walls[0].openings = [{ kind: "window", label: "A", offset: 48, width: 36, height: 48, header: "auto" }];
  const r2 = resolveHeaders(p2);
  assert.ok(r2.ok, JSON.stringify(r2.errors));
  assert.equal(r2.plan.walls[0].openings[0].header, "2x10");
});

test("a bad per-wall table is reported with its wall", () => {
  const plan = planWith();
  plan.walls[0].headerTable = [{ upTo: 0, header: "2x8" }];
  const r = resolveHeaders(plan);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /^wall /);
});
