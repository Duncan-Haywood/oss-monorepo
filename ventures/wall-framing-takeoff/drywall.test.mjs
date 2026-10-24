import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDrywall, validateDrywall } from "./drywall.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";


const plan = (walls) => ({ studLength: 92.625, defaultHeaderHeight: 82.5, walls });

test("a plain 16 ft wall, 8 ft high, inside face only: two courses of two 8 ft sheets", () => {
  const l = layoutDrywall({}, plan([{ id: "A", length: 192, sheathed: true }]));
  assert.ok(l.ok);
  assert.equal(l.hangHeight, 96);
  assert.equal(l.sheets.count, 4);
  assert.equal(l.netSqFt, 16 * 8);
});

test("a partition takes both faces", () => {
  const l = layoutDrywall({}, plan([{ id: "P", length: 192, sheathed: false }]));
  assert.equal(l.sheets.count, 8);
});

test("a short run reuses the offcut of a long one (12 ft sheets, 14 ft wall)", () => {
  const l = layoutDrywall({ sheetLength: 144 }, plan([{ id: "A", length: 168 }]));
  // each of 2 courses: a 168 in run = one 144 sheet + 24 in offcut run in a second sheet; 4 sheets, none shared across equal runs
  assert.equal(l.sheets.count, 3); // the two 24 in runs share one sheet
});

test("a door that fills the course splits it; a window inside it does not", () => {
  const door = layoutDrywall({}, plan([{ id: "A", length: 96, openings: [{ offset: 30, width: 36, height: 82.5 }] }]));
  // lower course: 30 and 30 in runs; upper course 96 -> bands: 48 band has runs [30,30]? door y 0..82.5 covers lower band fully
  assert.equal(door.bandSheets.find((b) => b.band === 48).runs, 3);
  const win = layoutDrywall({}, plan([{ id: "A", length: 96, openings: [{ offset: 30, width: 36, height: 30 }] }]));
  assert.equal(win.bandSheets.find((b) => b.band === 48).runs, 2);
});

test("a 9 ft wall gets a ripped 12 in course", () => {
  const l = layoutDrywall({ height: 108 }, plan([{ id: "A", length: 96 }]));
  assert.ok(l.bandSheets.some((b) => b.band === 12));
});

test("ceiling rows are 48 in; validation and CLI", () => {
  const l = layoutDrywall({ ceiling: [{ width: 192, depth: 100 }] }, plan([]));
  assert.equal(l.sheets.count, 6); // two 48 in rows of two sheets each, and a 4 in strip row of 192 in = two more sheets (strips are not reused)
});

test("bad input is refused", () => {
  assert.ok(validateDrywall({ sheetLength: 100 }).length);
  assert.ok(!layoutDrywall({ waste: 2 }, plan([])).ok);
});

test("--drywall shows in the CLI text output and in the budget", () => {
  const p = samplePlan();
  p.drywall = { ceiling: [{ width: 480, depth: 336 }], price: 14 };
  const r = main(["plan.json", "--drywall", "--budget"], () => JSON.stringify(p));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /DRYWALL/);
  assert.match(r.out, /Drywall sheets/);
});

test("tape: a 16 ft wall, 8 ft high, 8 ft sheets: 2 butt joints x 4 ft, one 16 ft flat seam, 16 ft ceiling angle", () => {
  const l = layoutDrywall({}, plan([{ id: "A", length: 192, sheathed: true }]));
  // per course: one butt joint of 48 in (2 courses = 96 in), one flat seam of 192 in, one angle of 192 in
  assert.equal(l.finishing.seamFt, (96 + 192) / 12);
  assert.equal(l.finishing.cornerFt, 16);
  assert.equal(l.finishing.tapeFt, 40);
  assert.equal(l.finishing.tapeRolls, 1);
  assert.equal(l.finishing.compoundGal, 1.5); // 128 sq ft x 0.01 x 1.1 = 1.408 -> 1.5
});

test("compound and tape rates are validated", () => {
  assert.ok(validateDrywall({ compoundGalPerSqFt: 1 }).length);
  assert.ok(validateDrywall({ tapeRollFt: 10 }).length);
});

test("corner bead: a 36 x 48 in window is two 48 in jambs and a 36 in head = 11 ft, 2 eight-foot sticks with 10% waste", () => {
  const l = layoutDrywall({}, plan([{ id: "A", length: 192, openings: [{ offset: 60, width: 36, height: 48 }] }]));
  assert.equal(l.finishing.beadFt, 11);
  assert.equal(l.finishing.beadSticks, 2); // 11 x 1.1 / 8 = 1.5
  const p = layoutDrywall({}, plan([{ id: "P", length: 192, sheathed: false, openings: [{ offset: 60, width: 36, height: 48 }] }]));
  assert.equal(p.finishing.beadFt, 22); // a partition is wrapped on both faces
  assert.equal(layoutDrywall({ openingBead: false }, plan([{ id: "A", length: 192, openings: [{ offset: 60, width: 36, height: 48 }] }])).finishing.beadFt, 0);
  assert.ok(validateDrywall({ beadStickFt: 7 }).length);
});
