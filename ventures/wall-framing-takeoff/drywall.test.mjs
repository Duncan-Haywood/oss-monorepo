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

test("compound is ordered in 4.5 gal pails; default rate equals the 450 sq ft per pail on a Sheetrock all-purpose listing", () => {
  const l = layoutDrywall({}, plan([{ id: "A", length: 192, sheathed: true }]));
  assert.equal(l.finishing.compoundPails, 1); // 1.5 gal
  assert.equal(l.finishing.pailGal, 4.5);
  assert.equal(4.5 / 450, l.finishing.compoundGalPerSqFt); // label: 450 sq ft per 4.5 gal
  const u = layoutDrywall({ compoundGalPerSqFt: 0.009 }, plan([{ id: "A", length: 192 * 10, sheathed: true }])); // USG ultralightweight: 2 pails per 1000 sq ft
  assert.equal(u.finishing.compoundPails, Math.ceil(u.finishing.compoundGal / 4.5 - 1e-9));
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

test("inside angles: one 8 ft run at a corner, two where a partition tees in, added to the tape", () => {
  const l = layoutDrywall({}, plan([{ id: "A", length: 192, sheathed: true, corner: true, tees: [96] }]));
  // height 96 in: corner 96 + tee 2 x 96 = 288 in = 24 ft
  assert.equal(l.finishing.insideCornerFt, 24);
  assert.equal(l.finishing.tapeFt, 40 + 24);
});

test("corner bead on free wall ends: a 16 ft stub partition with one free end, 8 ft high, both faces = 16 ft; two free ends = 32 ft; an exterior wall's one face = 8 ft", () => {
  assert.equal(layoutDrywall({}, plan([{ id: "P", length: 192, sheathed: false, freeEnds: 1 }])).finishing.beadFt, 16);
  assert.equal(layoutDrywall({}, plan([{ id: "P", length: 192, sheathed: false, freeEnds: 2 }])).finishing.beadFt, 32);
  assert.equal(layoutDrywall({}, plan([{ id: "A", length: 192, freeEnds: 1 }])).finishing.beadFt, 8);
  assert.equal(layoutDrywall({ openingBead: false }, plan([{ id: "A", length: 192, freeEnds: 1 }])).finishing.beadFt, 0);
});

test("jointsOnStuds: a 20 ft wall with 10 ft sheets lands its joint between studs unless snapped (hand count)", () => {
  const p = { ...plan([{ id: "A", length: 240 }]), studSpacing: 16 };
  // studs centred on 16 in multiples: 120 is not one (7.5 x 16), so a naive joint at 120 is off framing
  const off = layoutDrywall({ sheetLength: 120, jointsOnStuds: false }, p);
  assert.equal(off.sheets.count, 4);
  assert.deepEqual(off.joints, { total: 2, offFraming: 2, naiveOffFraming: 2 });
  // snapped: each course cuts at 112 and 224 (studs), pieces 112, 112, 16; a 16 in piece cannot join a 112 on one sheet (128 > 120) but the two courses' 16 in pieces share one: 4 + 1
  const on = layoutDrywall({ sheetLength: 120, jointsOnStuds: true }, p);
  assert.equal(on.sheets.count, 5);
  assert.deepEqual(on.joints, { total: 4, offFraming: 0, naiveOffFraming: 2 });
  // option unset: unchanged behaviour and no joint report
  const base = layoutDrywall({ sheetLength: 120 }, p);
  assert.equal(base.sheets.count, 4);
  assert.equal(base.joints, null);
});

test("jointsOnStuds: 8 ft sheets on 16 in studs already land on framing from a wall start", () => {
  const p = { ...plan([{ id: "A", length: 288 }]), studSpacing: 16 };
  const r = layoutDrywall({ jointsOnStuds: true }, p);
  assert.equal(r.joints.naiveOffFraming, 0);
  assert.equal(r.sheets.count, layoutDrywall({}, p).sheets.count);
});

test("ceilingJoistSpacing: a 20 x 8 ft ceiling, 10 ft sheets, joists at 16 in: the naive joint at 120 in is off a joist, snapping cuts at 112 and 224 (hand count)", () => {
  const p = plan([]);
  const c = [{ width: 240, depth: 96 }];
  const naive = layoutDrywall({ sheetLength: 120, ceiling: c, ceilingJoistSpacing: 16, jointsOnStuds: false }, p);
  assert.deepEqual(naive.ceilingJoints, { total: 2, offFraming: 2, naiveOffFraming: 2 });
  assert.equal(naive.sheets.count, 4);
  // snapped: each of 2 courses cuts 112 + 112 + 16; the two 16 in pieces share a sheet, so 4 + 1
  const on = layoutDrywall({ sheetLength: 120, ceiling: c, ceilingJoistSpacing: 16, jointsOnStuds: true }, p);
  assert.deepEqual(on.ceilingJoints, { total: 4, offFraming: 0, naiveOffFraming: 2 });
  assert.equal(on.sheets.count, 5);
  // unset: no ceiling report, same sheets as before
  const base = layoutDrywall({ sheetLength: 120, ceiling: c }, p);
  assert.equal(base.ceilingJoints, null);
  assert.equal(base.sheets.count, 4);
  assert.ok(validateDrywall({ ceilingJoistSpacing: 20 }).length);
});

test("ceilingJoistsFromRoof: joists the roof placed at 24 in (not a typed 16) decide the cuts; joistOrigin shifts a smaller ceiling", async () => {
  const { layoutRoof } = await import("./roof.mjs");
  const p = { ...plan([]), stock: samplePlan().stock };
  const roof = layoutRoof({ id: "R", width: 192, length: 240, pitch: 4, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 24, ridge: "2x10", ceilingJoist: "2x6", collarTies: false }, samplePlan());
  assert.ok(roof.ok, roof.errors?.join());
  const xs = [...new Set(roof.ceilingJoists.map((j) => j.x + 0.75))];
  assert.ok(xs.includes(24) && xs.includes(48) && !xs.includes(16));
  const c = [{ width: 240, depth: 96 }];
  const d = layoutDrywall({ sheetLength: 120, ceiling: c, ceilingJoistsFromRoof: true, jointsOnStuds: true }, p, roof);
  assert.ok(d.ok, d.errors?.join());
  assert.equal(d.ceilingJoints.offFraming, 0);
  // 24 in joists: the 120 in joint is on a joist, so unlike 16 in no extra cut-back pieces are needed
  const typed = layoutDrywall({ sheetLength: 120, ceiling: c, ceilingJoistSpacing: 24, jointsOnStuds: true }, p);
  assert.equal(d.ceilingJoints.total, typed.ceilingJoints.total);
  // a ceiling starting 48 in in from the roof's first wall sees the same joists shifted
  const shifted = layoutDrywall({ sheetLength: 120, ceiling: [{ width: 192, depth: 96, joistOrigin: 48 }], ceilingJoistsFromRoof: true, jointsOnStuds: true }, p, roof);
  assert.equal(shifted.ceilingJoints.offFraming, 0);
  // needs a roof with ceiling joists, and not both sources
  assert.ok(!layoutDrywall({ ceiling: c, ceilingJoistsFromRoof: true }, p, null).ok);
  assert.ok(validateDrywall({ ceilingJoistsFromRoof: true, ceilingJoistSpacing: 16 }).length);
});

test("ceiling step: a 10 ft soffit face 12 in deep on an 8 ft-sheet job: 2 runs (96 + 24), 10 sq ft net, 10 ft bead, 10 ft inside angle, 1 butt joint of 12 in (hand count)", () => {
  const c = [{ width: 192, depth: 96 }];
  const base = layoutDrywall({ ceiling: c }, plan([]));
  const l = layoutDrywall({ ceiling: [{ ...c[0], steps: [{ length: 120, drop: 12 }] }] }, plan([]));
  assert.ok(l.ok);
  assert.equal(l.ceilings[0].stepSqFt, 10);
  assert.equal(l.netSqFt - base.netSqFt, 10);
  assert.equal(l.finishing.beadFt, 10);
  assert.equal(l.finishing.insideCornerFt, 10);
  assert.equal(l.finishing.seamFt - base.finishing.seamFt, 1);
  assert.ok(validateDrywall({ ceiling: [{ width: 192, depth: 96, steps: [{ length: 120, drop: 80 }] }] }).length);
});
