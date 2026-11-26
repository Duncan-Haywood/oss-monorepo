// Behaviour of --shallow-headers, --trim-openings and --doors-to-floor at
// their edges. A red-team campaign on 2026-11-26 seeded 8 faults in
// shallowheaders.mjs and the suite caught none of them: the CLI tests only
// checked that some 2x header was chosen and never stood on a boundary.
// Invented plans only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shallowHeaders, trimOpenings, doorsToFloor } from "./shallowheaders.mjs";
import { THICK } from "./engine.mjs";

const STUD = 92.625; // top plates' underside at THICK + STUD = 94.125 in
const stock = ["2x4", "2x6", "2x8", "2x10", "2x12"].map((size) => ({ size, length: 96, price: 1 }));
const plan = (openings, extra = {}) => ({
  studLength: STUD,
  defaultHeaderHeight: 82.5,
  stock,
  walls: [{ id: "A", length: 120, openings, ...extra }],
});
const door = (o) => ({ kind: "door", label: "D", offset: 24, width: 36, header: "2x6", ...o });

test("the deepest listed header that fits is chosen, not the next one down", () => {
  // header bottom at 86 in leaves 94.125 - 86 = 8.125 in: a 2x8 (7.25) fits, a 2x10 (9.25) does not
  const p = plan([door({ headerHeight: 86, height: 86 - THICK, header: "2x12" })]);
  const notes = shallowHeaders(p);
  assert.equal(p.walls[0].openings[0].header, "2x8");
  assert.match(notes.join("\n"), /2x12 header is 3\.13 in too deep .* so 2x8 \(7\.25 in\) was used/);
});

test("a header that only a size missing from the lumber list would fit is left with a note", () => {
  const p = plan([door({ headerHeight: 86, height: 86 - THICK, header: "2x12" })]);
  p.stock = stock.filter((s) => s.size !== "2x8" && s.size !== "2x6" && s.size !== "2x4");
  const notes = shallowHeaders(p);
  assert.equal(p.walls[0].openings[0].header, "2x12");
  assert.match(notes[0], /nothing on the lumber list fits the 8\.13 in of room/);
});

test("a door exactly 2 in above the plate is a threshold: framed taller, header kept, by either flag", () => {
  for (const fn of [shallowHeaders, doorsToFloor]) {
    const p = plan([door({ headerHeight: 82.5, height: 82.5 - THICK - 2 })]);
    const notes = fn(p);
    const op = p.walls[0].openings[0];
    assert.equal(op.height, 82.5 - THICK, fn.name);
    assert.equal(op.headerHeight, 82.5, fn.name);
    assert.match(notes.join("\n"), /door bottom is 2\.00 in above the floor .* framed 2\.00 in taller/, fn.name);
  }
});

test("--doors-to-floor alone frames a threshold door (it used to be left refused)", () => {
  const p = plan([door({ headerHeight: 82.5, height: 82.5 - THICK - 1.625 })]);
  const notes = doorsToFloor(p);
  assert.equal(p.walls[0].openings[0].height, 82.5 - THICK);
  assert.equal(notes.length, 1);
  assert.equal(shallowHeaders(p).length, 0, "already on the floor: --shallow-headers adds no second note");
});

test("a door just over 2 in above the plate is lowered whole, leaf kept", () => {
  const p = plan([door({ headerHeight: 82.5, height: 82.5 - THICK - 2.5 })]);
  const notes = doorsToFloor(p);
  const op = p.walls[0].openings[0];
  assert.equal(op.height, 82.5 - THICK - 2.5);
  assert.equal(op.headerHeight, 80);
  assert.match(notes[0], /2\.50 in lower/);
  // --shallow-headers leaves a raised door alone: it is not a threshold
  const q = plan([door({ headerHeight: 82.5, height: 82.5 - THICK - 2.5 })]);
  assert.deepEqual(shallowHeaders(q), []);
  assert.equal(q.walls[0].openings[0].height, 82.5 - THICK - 2.5);
});

test("a door on the floor and a window are never touched by --doors-to-floor", () => {
  const p = plan([door({ headerHeight: 82.5, height: 82.5 - THICK }), { kind: "window", offset: 70, width: 30, height: 40, headerHeight: 82.5, header: "2x6" }]);
  const before = JSON.stringify(p);
  assert.deepEqual(doorsToFloor(p), []);
  assert.equal(JSON.stringify(p), before);
});

test("null walls, gable walls and non-list walls or openings are skipped, not thrown on", () => {
  const raised = () => door({ headerHeight: 120, height: 80, header: "2x12" });
  for (const fn of [shallowHeaders, trimOpenings, doorsToFloor]) {
    const p = plan([raised()], { gable: { pitch: 6 } });
    p.walls.unshift(null);
    const before = JSON.stringify(p);
    assert.deepEqual(fn(p), [], fn.name);
    assert.equal(JSON.stringify(p), before, `${fn.name} changed a gable wall`);
    for (const walls of [5, {}, "x"]) assert.deepEqual(fn({ ...plan([]), walls }), [], `${fn.name} walls=${JSON.stringify(walls)}`);
    for (const openings of [5, {}, "x"]) assert.deepEqual(fn(plan(openings)), [], `${fn.name} openings=${JSON.stringify(openings)}`);
  }
});

test("--trim-openings trims by exactly the excess over the shallowest listed header, keeping the bottom", () => {
  // header bottom at 92 in leaves 2.125 in: even a 2x4 (3.5) needs 1.375 in more
  const p = plan([{ kind: "window", label: "W", offset: 24, width: 30, height: 40, headerHeight: 92, header: "2x6" }]);
  const notes = trimOpenings(p);
  const op = p.walls[0].openings[0];
  assert.equal(op.header, "2x4");
  assert.equal(op.headerHeight, 92 - 1.375);
  assert.equal(op.height, 40 - 1.375);
  assert.match(notes[0], /1\.38 in taller than the room/);
  // where a listed header fits, trimming is --shallow-headers' job
  const q = plan([door({ headerHeight: 86, height: 86 - THICK, header: "2x12" })]);
  assert.deepEqual(trimOpenings(q), []);
});
