import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutSiding, validateSiding, sidingText } from "./siding.mjs";

// stud 92.625 + 3 x 1.5 = 97.125 -> rounds to 96 in (8 ft)
const plan = (walls) => ({ studLength: 92.625, defaultHeaderHeight: 82, walls });

test("a plain 12 ft wall, by hand", () => {
  const s = layoutSiding({ waste: 0, exposure: 8, stock: 144 }, plan([{ id: "A", length: 144 }]));
  assert.equal(s.height, 96);
  assert.equal(s.courses, 12); // 96 / 8
  assert.equal(s.boards, 12); // one 12 ft board per course
  assert.ok(Math.abs(s.netSqFt - 96) < 1e-9); // 12 x 8
  assert.equal(s.wrapRolls, 1); // 105.6 sq ft in a 1350 roll
});

test("a window splits only the courses it cuts", () => {
  // 120 in wall, 8 courses of 12 in; window 36 wide at x 40, sill 36, head 72 -> cuts courses 3..5 (y 36..72)
  const p = plan([{ id: "A", length: 120, openings: [{ kind: "window", offset: 40, width: 36, height: 36, headerHeight: 72 }] }]);
  const s = layoutSiding({ waste: 0, exposure: 12, stock: 144 }, p);
  assert.equal(s.courses, 8);
  // 5 full runs of 120, 3 courses of 40 + 44 = 84 each: 5*120 + 3*84 = 852 in
  assert.ok(Math.abs(s.runFeet - 852 / 12) < 1e-9);
  assert.ok(Math.abs(s.openingSqFt - 9) < 1e-9);
  // five 120 in runs take a board each; the six 40 and 44 in runs pack two boards (40+44+40 | 44+40+44)
  assert.equal(s.boards, 5 + 2);
});

test("interior walls are skipped; no exterior wall is an error", () => {
  const s = layoutSiding({}, plan([{ id: "A", length: 100 }, { id: "B", length: 500, sheathed: false }]));
  assert.equal(s.walls, 1);
  assert.equal(layoutSiding({}, plan([{ id: "B", length: 100, sheathed: false }])).ok, false);
});

test("corner boards, wrap laps, prices, text and bad input", () => {
  const s = layoutSiding({ waste: 0, corners: 4, cornerStock: 120, wrapLap: 0.1, wrapRollSqFt: 100, boardPrice: 10, wrapPrice: 100, cornerPrice: 20 }, plan([{ id: "A", length: 144 }]));
  assert.equal(s.cornerBoards, 8); // 8 pieces of 96 in, one per 120 in board
  assert.equal(s.wrapRolls, Math.ceil(96 * 1.1 / 100)); // 2
  assert.equal(s.cost, s.boards * 10 + 2 * 100 + 8 * 20);
  assert.ok(sidingText(s).length >= 4);
  assert.equal(validateSiding({ exposure: 1 }).length, 1);
  assert.equal(validateSiding({ corners: 2.5 }).length, 1);
  assert.equal(layoutSiding({ waste: 0.9 }, plan([{ id: "A", length: 100 }])).ok, false);
});
