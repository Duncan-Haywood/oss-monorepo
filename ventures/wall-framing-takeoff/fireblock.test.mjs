import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFireblock, validateFireblock, fireblockText } from "./fireblock.mjs";

const stud = (x, h) => ({ kind: "stud", orient: "v", x, y: 1.5, w: 1.5, h });
// a 12 ft wall: members reach y = 1.5 + 141 = 142.5; three bays of 14.5 in, 14.5 in and 30 in
const wall = { id: "T", stud: "2x4", members: [stud(0, 141), stud(16, 141), stud(32, 141), stud(63.5, 141), { kind: "plate", orient: "h", x: 0, y: 0, w: 65, h: 1.5 }] };

test("by hand: 142.5 in wall, 10 ft interval -> 1 row; gaps 14.5, 14.5, 30", () => {
  const f = layoutFireblock({}, { walls: [wall] });
  assert.equal(f.rowsTotal, 1);
  assert.equal(f.pieces, 3);
  assert.ok(Math.abs(f.sizes[0].lengthFt - 59 / 12) < 1e-9);
  // 96 in board: 30 + 14.5 + 14.5 + 3 kerfs (0.375) = 59.375 fits one board; 5% waste rounds up to 2? ceil(1.05)=2
  assert.equal(f.sizes[0].boardsPacked, 1);
  assert.equal(f.boards, 2);
});

test("a wall at or under the interval needs no rows", () => {
  const short = { id: "S", members: [stud(0, 90), stud(16, 90)] };
  const f = layoutFireblock({}, { walls: [short] });
  assert.equal(f.pieces, 0);
  assert.equal(f.boards, 0);
  assert.match(fireblockText(f).join("\n"), /No wall is taller/);
});

test("a tighter interval adds rows; rows can be typed; cost", () => {
  assert.equal(layoutFireblock({ intervalFt: 5, waste: 0 }, { walls: [wall] }).rowsTotal, 2);
  const g = layoutFireblock({ rows: 3, waste: 0, boardPrice: 7 }, { walls: [wall] });
  assert.equal(g.pieces, 9);
  // first-fit decreasing: three 30s = 90.375 in on one board, six 14.5s = 87.75 in on another
  assert.equal(g.sizes[0].boardsPacked, 2);
  assert.equal(g.cost, 14);
});

test("bad inputs are refused", () => {
  assert.ok(validateFireblock({ intervalFt: 1 }).length);
  assert.ok(validateFireblock({ rows: 1.5 }).length);
  assert.ok(validateFireblock({ boardPrice: -1 }).length);
  assert.ok(validateFireblock({ intervalFt: "10" }).length);
  assert.equal(layoutFireblock({ waste: 2 }, { walls: [wall] }).ok, false);
});

test("hostile layouts are refused with a reason, not a raw error or a hang (2026-11-06)", () => {
  const v = (h) => [{ orient: "v", x: 0, y: 0, w: 1.5, h }, { orient: "v", x: 10, y: 0, w: 1.5, h }];
  for (const bad of [null, 5, "x", {}, { walls: "x" }, { walls: [null] }, { walls: [{ id: "a", members: [null] }] },
    { walls: [{ id: "a", members: [{ orient: "v", x: 0, y: 0, w: 1.5, h: NaN }] }] },
    { walls: [{ id: "a", members: v(1e9) }] }, { walls: [{ id: "a", members: v(2000) }] }]) {
    const r = layoutFireblock({}, bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  }
  assert.equal(layoutFireblock({}, { walls: [{ id: "a", members: v(142.5) }] }).ok, true);
});
