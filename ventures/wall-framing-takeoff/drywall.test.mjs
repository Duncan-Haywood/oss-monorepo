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
