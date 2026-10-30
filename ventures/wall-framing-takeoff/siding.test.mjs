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

test("a gable end counts its triangle, by hand", () => {
  // 120 in wide, 6:12, peak at 60: rise 30 in over 8 ft eave (96 in); exposure 6 -> 21 courses (126 / 6)
  const s = layoutSiding({ waste: 0, exposure: 6, stock: 240 }, plan([{ id: "G", length: 120, gable: { pitch: 6 } }]));
  assert.equal(s.courses, 21);
  assert.ok(Math.abs(s.netSqFt - (120 * 96 + 0.5 * 120 * 30) / 144) < 1e-9);
  // 16 courses to the eave at 120; triangle courses at 96, 102, ..., 120 above: widths 120 - 2*(up/0.5) = 120 - 4 up
  // up = 0, 6, 12, 18, 24: 120, 96, 72, 48, 24
  assert.ok(Math.abs(s.runFeet * 12 - (16 * 120 + 120 + 96 + 72 + 48 + 24)) < 1e-9);
});

test("an off-centre peak: the far side has the steeper-or-shallower pitch to the same peak", () => {
  // 100 wide, peak at 25, 12:12 -> rise 25; far slope 25/75; up=10 -> 100 - 10 - 30 = 60
  const s = layoutSiding({ waste: 0, exposure: 10, stock: 240, height: 96 }, plan([{ id: "G", length: 100, gable: { pitch: 12, peak: 25 } }]));
  assert.ok(Math.abs(s.netSqFt - (100 * 96 + 0.5 * 100 * 25) / 144) < 1e-9);
  // 13 courses: ten full (one straddles the eave line), then up = 4, 14, 24 -> 100 - up - 3 up = 84, 44, 4
  assert.equal(s.courses, 13);
  assert.ok(Math.abs(s.runFeet * 12 - (1000 + 84 + 44 + 4)) < 1e-9);
});

test("opening trim: head, jambs and a window sill, packed by hand (2026-10-30)", () => {
  const p = plan([{ id: "A", length: 240, openings: [
    { kind: "window", offset: 20, width: 36, height: 36, headerHeight: 72 },
    { kind: "door", offset: 120, width: 36, height: 80, headerHeight: 80 },
  ] }]);
  const off = layoutSiding({ waste: 0 }, p);
  assert.equal(off.trim, null); // off by default: earlier totals do not move
  const s = layoutSiding({ waste: 0, openingTrim: true, trimStock: 96, trimPrice: 10 }, p);
  // 3.5 in boards: window head and sill 43, jambs 36 x2; door head 43, jambs 80 x2
  // pieces 80 80 43 43 43 36 36 = 361 in; first fit decreasing into 96 in: [80] [80] [43 43] [43 36] [36] = 5 boards
  assert.equal(s.trim.doors, 1); assert.equal(s.trim.windows, 1);
  assert.ok(Math.abs(s.trim.feet - 361 / 12) < 1e-9);
  assert.equal(s.trim.boards, 5);
  assert.equal(s.cost, 50);
  assert.ok(sidingText(s).some((x) => x.includes("Opening trim: 1 door(s)")));
  assert.equal(layoutSiding({ trimWidth: 9 }, p).ok, false);
});
