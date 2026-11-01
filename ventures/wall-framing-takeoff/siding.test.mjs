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

test("an opening that rises into the gable triangle cuts its courses and the wrap, by hand (2026-11-01)", () => {
  // 120 wide, 6:12, eave 96, rise 30; window x 50..70, y 84..108 (head 108 is 12 in into the triangle)
  const p = plan([{ id: "G", length: 120, gable: { pitch: 6 }, openings: [{ kind: "window", offset: 50, width: 20, height: 24, headerHeight: 108 }] }]);
  const s = layoutSiding({ waste: 0, exposure: 6, stock: 240 }, p);
  // courses y 0..78 (13): whole 120. Course 78..84: whole. Courses 84..90, 90..96: cut -> 50 + 50 each.
  // triangle: up 0 (y96..102): left 0, right 120 -> 50 + 50; up 6 (102..108): left 12, right 108 -> 38 + 38;
  // up 12 (108..114): head at 108 so not cut -> width 72; up 18: 48; up 24: 24
  const expect = 14 * 120 + 2 * 100 + 100 + 76 + 72 + 48 + 24;
  assert.ok(Math.abs(s.runFeet * 12 - expect) < 1e-9, `${s.runFeet * 12} vs ${expect}`);
  // wall area less the full window (20 x 24), now that none of it is clipped away
  assert.ok(Math.abs(s.netSqFt - (120 * 96 + 0.5 * 120 * 30 - 20 * 24) / 144) < 1e-9);
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

test("vertical siding: columns, pieces round an opening, gable and refusal, by hand (2026-10-30)", () => {
  // 120 in wall, 8 ft high, 12 in boards: 10 columns; window x 40..76 (36 wide), y 36..72 touches columns 3,4,5,6 (x 36..84)
  const p = plan([{ id: "A", length: 120, openings: [{ kind: "window", offset: 40, width: 36, height: 36, headerHeight: 72 }] }]);
  const s = layoutSiding({ waste: 0, style: "vertical", boardWidth: 12, stock: 96 }, p);
  assert.equal(s.style, "vertical");
  assert.equal(s.courses, 10);
  // 6 full 96 in boards + 4 columns x (36 below + 24 above) = 576 + 240 = 816 in
  assert.ok(Math.abs(s.runFeet * 12 - 816) < 1e-9);
  // 6 boards of 96; the eight pieces of 36 and 24 pack into 96 in boards: 36+36+24 | 36+36+24 | 24+24 -> 3 boards
  assert.equal(s.boards, 6 + 3);
  assert.ok(sidingText(s)[0].includes("Siding (vertical)"));
  // gable: 120 wide, 6:12, 12 in columns; the column holding the peak (x 60) is 96 + 30 long; first column 96 + 0.5 * 12 = 102
  const g = layoutSiding({ waste: 0, style: "vertical", boardWidth: 12, stock: 144 }, plan([{ id: "G", length: 120, gable: { pitch: 6 } }]));
  assert.ok(g.ok); assert.ok(Math.abs(g.runFeet * 12 - 2 * (102 + 108 + 114 + 120 + 126)) < 1e-9);
  assert.equal(layoutSiding({ style: "vertical", stock: 72 }, plan([{ id: "A", length: 100 }])).ok, false);
  assert.equal(validateSiding({ style: "slate" }).length, 1);
  assert.equal(validateSiding({ boardWidth: 1 }).length, 1);
});

test("vertical siding battens: one per seam, cut at an opening and by the gable line, by hand (2026-10-30)", () => {
  // 120 in wall, 12 in columns: 9 seams at x = 12..108; window x 40..76 y 36..72 crosses seams 48, 60, 72
  const p = plan([{ id: "A", length: 120, openings: [{ kind: "window", offset: 40, width: 36, height: 36, headerHeight: 72 }] }]);
  const s = layoutSiding({ waste: 0, style: "vertical", boardWidth: 12, stock: 96, battens: true, battenPrice: 2 }, p);
  assert.equal(s.battens.pieces, 6 + 3 * 2);
  assert.ok(Math.abs(s.battens.feet * 12 - (6 * 96 + 3 * 60)) < 1e-9);
  // six 96s, then six 36s and 24s: 36+36+24 | 36+24+24 | 24 ... 3 x 36 + 3 x 24 = 180 in -> 2 boards
  assert.equal(s.battens.boards, 6 + 2);
  assert.equal(s.cost, 2 * s.battens.boards);
  assert.equal(layoutSiding({ waste: 0, style: "vertical", boardWidth: 12, stock: 96 }, p).battens, null);
  // gable 120 wide, 6:12: seams at 12..108 stand 96 + 0.5 x, 96 + 0.5 x(120-x)
  const g = layoutSiding({ waste: 0, style: "vertical", boardWidth: 12, stock: 144, battens: true }, plan([{ id: "G", length: 120, gable: { pitch: 6 } }]));
  assert.ok(Math.abs(g.battens.feet * 12 - (2 * (102 + 108 + 114 + 120) + 126)) < 1e-9);
  assert.ok(sidingText(s).some((x) => x.includes("Battens:")));
  assert.equal(validateSiding({ battenStock: 10 }).length, 1);
});

test("starter strip: one run along each exterior wall, packed into stock by hand (2026-10-31)", () => {
  // walls of 240, 168 and 100 in, the last unsheathed: 408 in of strip in 240 in boards, whole pieces: [240] [168] = 2 boards
  const p = plan([{ id: "A", length: 240 }, { id: "B", length: 168 }, { id: "C", length: 100, sheathed: false }]);
  assert.equal(layoutSiding({ waste: 0 }, p).starter, null); // off by default: earlier totals do not move
  const s = layoutSiding({ waste: 0, starter: true, starterPrice: 5, stock: 240 }, p);
  assert.equal(s.starter.walls, 2);
  assert.ok(Math.abs(s.starter.feet - 408 / 12) < 1e-9);
  assert.equal(s.starter.boards, 2); // 240 and 168 do not share a 240 in board
  assert.equal(s.cost, 10);
  assert.ok(sidingText(s).some((x) => x.includes("Starter strip: 34 ft along the base of 2 wall(s)")));
  assert.equal(layoutSiding({ starter: true, style: "vertical" }, p).ok, false);
  assert.equal(layoutSiding({ starter: "yes" }, p).ok, false);
});

test("head flashing: one piece run per opening, packed by hand (2026-10-31)", () => {
  // openings of 36 and 60 in with 2 in past each jamb: 40 and 64 in; in 72 in stock 40 + 64 do not share a piece: 2 pieces
  const p = plan([{ id: "A", length: 240, openings: [{ kind: "window", offset: 20, width: 36, height: 48 }, { kind: "door", offset: 100, width: 60, height: 80 }] }]);
  assert.equal(layoutSiding({ waste: 0 }, p).flashing, null); // off by default: earlier totals do not move
  const s = layoutSiding({ waste: 0, headFlashing: true, flashingStock: 72, flashingPrice: 4 }, p);
  assert.equal(s.flashing.openings, 2);
  assert.ok(Math.abs(s.flashing.feet - 104 / 12) < 1e-9);
  assert.equal(s.flashing.pieces, 2);
  assert.equal(s.cost, 8);
  assert.ok(sidingText(s).some((x) => x.includes("Head flashing: 2 opening(s), 9 ft")));
  assert.equal(layoutSiding({ headFlashing: "yes" }, p).ok, false);
  assert.equal(layoutSiding({ headFlashing: true, flashingExtend: 20 }, p).ok, false);
});

test("opening tape: sill and jamb runs summed by hand, whole rolls (2026-10-31)", () => {
  // 36 x 48 window: 36+4 = 40 sill + 2 x (48+2) = 100 jamb = 140 in; 60 x 80 door: 64 + 2 x 82 = 228 in; total 368 in
  const p = plan([{ id: "A", length: 240, openings: [{ kind: "window", offset: 20, width: 36, height: 48 }, { kind: "door", offset: 100, width: 60, height: 80 }] }]);
  assert.equal(layoutSiding({ waste: 0 }, p).tape, null);
  const s = layoutSiding({ waste: 0, openingTape: true, tapeRollFeet: 20, tapePrice: 12 }, p);
  assert.equal(s.tape.openings, 2);
  assert.ok(Math.abs(s.tape.feet - 368 / 12) < 1e-9); // 30.67 ft in 20 ft rolls
  assert.equal(s.tape.rolls, 2);
  assert.equal(s.cost, 24);
  assert.ok(sidingText(s).some((x) => x.includes("Opening tape: 2 opening(s), 31 ft")));
  assert.equal(layoutSiding({ openingTape: 1 }, p).ok, false);
  assert.equal(layoutSiding({ openingTape: true, tapeRollFeet: 5 }, p).ok, false);
});
