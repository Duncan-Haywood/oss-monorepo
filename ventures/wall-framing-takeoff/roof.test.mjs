import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { layoutRoof, roofCuts, sampleRoof, roofText, slopeFactor, birdsmouth } from "./roof.mjs";

const plan = () => ({ ...samplePlan(), walls: [] });

test("slope factor of a 6:12 roof is sqrt(1.25)", () => {
  assert.ok(Math.abs(slopeFactor(6) - 1.118034) < 1e-6);
});

test("a 28 x 40 ft 4:12 roof: rafter length, count and rise match hand arithmetic", () => {
  const l = layoutRoof(sampleRoof(), plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  // (168 - 0.75 + 12) * sqrt(1 + 1/9) = 179.25 * 1.05409... = 188.94 in, rounded to 1/16
  assert.ok(Math.abs(l.rafterLength - 179.25 * Math.sqrt(10) / 3) < 1 / 16);
  assert.equal(l.centres.length, 31); // 0.75, every 16 in to 464, and 479.25
  assert.equal(l.rafters.length, 62);
  assert.equal(l.rise, 56);
  assert.equal(l.ceilingJoists.length, 62); // two lapped pieces per line, 171 in each (168 + 3)
  assert.ok(l.ceilingJoists.every((j) => j.length === 171));
  assert.equal(l.collarTies.length, 16);
});

test("ridge is split over rafters and no piece exceeds the longest board", () => {
  const l = layoutRoof(sampleRoof(), plan());
  assert.equal(l.ridges.reduce((s, x) => s + x.length, 0), 504);
  for (const x of l.ridges) assert.ok(x.length <= 192);
  assert.ok(l.ridges.length >= 3);
});

test("sheathing: courses add to the slope and the sheets cover the roof area", () => {
  const l = layoutRoof(sampleRoof(), plan());
  const slope = 180 * Math.sqrt(10) / 3; // eave to ridge incl. overhang
  assert.ok(Math.abs(l.slope - slope) < 1e-6);
  assert.ok(Math.abs(l.courses.reduce((s, c) => s + c.width, 0) - slope) < 1e-6);
  for (const c of l.courses) assert.ok(Math.abs(c.pieces.reduce((s, p) => s + p.length, 0) - 504) < 1e-6);
  assert.ok(l.sheets.count * 32 >= l.sheets.area);
  assert.ok(l.sheets.waste >= 0 && l.sheets.waste < 0.2);
});

test("roofing quantities: squares, bundles and trim", () => {
  const l = layoutRoof(sampleRoof(), plan());
  const area = 2 * 504 * l.slope / 144;
  assert.ok(Math.abs(l.roofing.squares - area / 100) < 1e-9);
  assert.equal(l.roofing.shingleBundles, Math.ceil(area / 100 * 1.1 * 3 - 1e-9));
  assert.equal(l.roofing.ridgeBundles, Math.ceil(42 / 33));
});

test("a rafter longer than any listed board is rejected with the way out", () => {
  const l = layoutRoof({ ...sampleRoof(), pitch: 8 }, plan());
  assert.equal(l.ok, false);
  assert.match(l.errors[0], /trusses|longer boards/);
});

test("trusses replace the framing with a purchased count", () => {
  const l = layoutRoof({ ...sampleRoof(), trusses: { spacing: 24 } }, plan());
  assert.ok(l.ok);
  assert.equal(l.rafters.length, 0);
  assert.equal(l.trusses.count, 21);
  assert.deepEqual(roofCuts(l), []);
  assert.ok(l.sheets.count > 0);
});

test("roof cuts pool with the walls in one takeoff", () => {
  const l = layoutRoof(sampleRoof(), plan());
  const r = takeoff(samplePlan(), roofCuts(l));
  assert.ok(r.ok);
  assert.ok(r.cuts.some((c) => c.kind === "rafter" && c.qty === 62));
  assert.ok(r.orders.some((o) => o.size === "2x8"));
});

test("validation rejects nonsense and unknown sizes", () => {
  assert.equal(layoutRoof({ ...sampleRoof(), pitch: 0 }, plan()).ok, false);
  assert.match(layoutRoof({ ...sampleRoof(), rafter: "2x7" }, plan()).errors[0], /Unknown rafter size/);
});

test("text prints the headline numbers", () => {
  assert.match(roofText(layoutRoof(sampleRoof(), plan())).join("\n"), /62 2x8 rafters/);
});

const hipPlan = () => ({ ...plan() });
const hipRoof = (o = {}) => ({ ...sampleRoof(), shape: "hip", width: 240, length: 480, ...o });

test("hip roof: common, hip and jack lengths match hand arithmetic", () => {
  const l = layoutRoof(hipRoof(), hipPlan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  const k = Math.sqrt(10) / 3; // 4:12
  assert.ok(Math.abs(l.rafterLength - (120 - 0.75 + 12) * k) < 1 / 16);
  // hip: plan run (120 + 12) x sqrt 2 over a rise of 4 per 12 of run -> 132 x sqrt(2 + 1/9)
  assert.ok(Math.abs(l.hipLength - 132 * Math.sqrt(2 + 1 / 9)) < 1 / 16);
  assert.equal(l.hips.length, 4);
  // the hip equals the diagonal of its plan run and its rise
  const planRun = 132 * Math.SQRT2, rise = 132 * 4 / 12;
  assert.ok(Math.abs(l.hipLength - Math.hypot(planRun, rise)) < 1 / 16);
  // a jack 16 in from the corner: run 16 + 12 less the hip's half thickness square to the jack
  const j = l.jacks.find((x) => x.d === 16);
  assert.ok(Math.abs(j.length - (28 - 0.75 * Math.SQRT2) * k) < 1 / 16);
  // jacks at 16..112 on both planes of all four corners
  assert.equal(l.jacks.length, 4 * 2 * 7);
});

test("hip roof: jack lengths grow by spacing x slope factor and the ridge is length - width", () => {
  const l = layoutRoof(hipRoof(), hipPlan());
  const ds = l.jacks.filter((x) => x.corner === 0 && x.plane === "long").sort((a, b) => a.d - b.d);
  for (let i = 1; i < ds.length; i++) assert.ok(Math.abs(ds[i].length - ds[i - 1].length - 16 * Math.sqrt(10) / 3) < 1 / 8);
  assert.equal(l.ridges.reduce((s, x) => s + x.length, 0), 240);
  assert.equal(l.centres[0], 120);
  assert.equal(l.centres.at(-1), 360);
  assert.ok(l.centres.every((c, i) => i === 0 || c - l.centres[i - 1] >= 9));
});

test("hip roof: plane areas add to the closed form and the sheets cover them", () => {
  const l = layoutRoof(hipRoof(), hipPlan());
  const s = l.slope;
  const closed = (2 * ((504 + 240) / 2) * s + 2 * (264 / 2) * s) / 144;
  assert.ok(Math.abs(l.sheets.area - closed) < 1e-6);
  assert.ok(l.sheets.count * 32 >= l.sheets.area);
  assert.equal(l.roofing.hipFeet, 4 * l.hipLength / 12);
  assert.equal(l.roofing.rakeFeet, 0);
});

test("a square hip roof is a pyramid: no ridge, four hips, jacks on both sides of each", () => {
  const l = layoutRoof(hipRoof({ width: 240, length: 240, ridge: null, ceilingJoist: undefined, collarTies: false }), hipPlan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  assert.equal(l.ridges.length, 0);
  assert.equal(l.hips.length, 4);
  assert.equal(l.rafters.length, 2 + 2); // two commons at the apex line plus an end rafter each side
});

test("hip roof rejects trusses, a short length and an over-long hip", () => {
  assert.match(layoutRoof(hipRoof({ trusses: {} }), hipPlan()).errors[0], /girder/);
  assert.match(layoutRoof(hipRoof({ width: 480, length: 240 }), hipPlan()).errors[0], /at least/);
  assert.match(layoutRoof(sampleRoof_hip(), hipPlan()).errors[0], /hip rafter is longer/);
});
function sampleRoof_hip() { return { ...sampleRoof(), shape: "hip" }; }

test("hip lumber joins the pooled order with hips and jacks as their own kinds", () => {
  const l = layoutRoof(hipRoof({ hip: "2x10" }), hipPlan());
  const kinds = new Set(roofCuts(l).map((c) => c.kind));
  assert.ok(kinds.has("hip rafter") && kinds.has("jack rafter"));
  const r = takeoff(samplePlan(), roofCuts(l));
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.match(roofText(l).join("\n"), /Hip roof: 32 common rafters/);
});

// L-shaped roof: 28 x 40 ft 4:12 main, 16 ft wide wing 12 ft out, centred 20 ft along, right side
const wingRoof = (wing = {}) => ({ ...sampleRoof(), ceilingJoist: undefined, collarTies: false, wing: { width: 192, projection: 144, at: 240, side: "right", valley: "2x8", ...wing } });

test("cross wing: valley length, wing ridge and station counts match hand arithmetic", () => {
  const l = layoutRoof(wingRoof(), plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  const k = Math.sqrt(10) / 3;
  // valley: (96 + 12) in of plan leg each way -> 108 x sqrt(2 + 1/9)
  assert.equal(l.valleys.length, 2);
  assert.ok(Math.abs(l.valleyLength - 108 * Math.sqrt(2 + 1 / 9)) < 1 / 16);
  // wing ridge: 144 out + 96 to the main roof + 12 rake
  assert.equal(l.wingRidges.reduce((s, x) => s + x.length, 0), 252);
  // commons at u = 0.75 and 16..128 (clear of the main eave line at 132), both sides
  assert.equal(l.wingRafters.length, 18);
  assert.ok(l.wingRafters.every((x) => Math.abs(x.length - 107.25 * k) < 1 / 16));
  // valley jacks at u = 144..224 (six stations), both sides; first has run 240 - 144 - 0.75
  assert.equal(l.wingJacks.length, 12);
  const first = l.wingJacks.find((j) => j.u === 144);
  assert.ok(Math.abs(first.length - (96 - 0.75 - 0.75 * Math.SQRT2) * k) < 1 / 16);
  // main rafters on the right within 108 in of the wing axis (stations 144..336) end at the valley
  assert.equal(l.rafters.filter((x) => x.kind).length, 13);
  const mid = l.rafters.find((x) => x.kind && Math.abs(x.x + 0.75 - 240) < 1e-9);
  assert.ok(Math.abs(mid.length - (168 - 0.75 - 96 - 0.75 * Math.SQRT2) * k) < 1 / 16);
});

test("cross wing: ridge height is half the width times the pitch, below the main ridge", () => {
  const l = layoutRoof(wingRoof(), plan());
  // 16 ft wing at 4:12: 96 in x 4/12 = 32 in; 28 ft main: 168 x 4/12 = 56 in -> 24 in lower
  assert.equal(l.wing.ridgeRise, 32);
  assert.equal(l.wing.ridgeBelowMain, 24);
  assert.match(roofText(l).join("\n"), /below the main ridge/);
});

test("cross wing: area is the main roof plus two wing planes less the triangle they cover", () => {
  const base = layoutRoof({ ...wingRoof(), wing: undefined }, plan());
  const l = layoutRoof(wingRoof(), plan());
  const k = Math.sqrt(10) / 3;
  const reach = 108;
  const added = (2 * ((132 + 12) + (240 + 12)) / 2 * reach - reach * reach) * k / 144;
  assert.ok(Math.abs(l.sheets.area - base.sheets.area - added) < 1e-6);
  assert.ok(l.sheets.count > base.sheets.count);
  assert.ok(Math.abs(l.roofing.valleyFeet - 2 * l.valleyLength / 12) < 1e-9);
  assert.ok(l.roofing.shingleBundles > base.roofing.shingleBundles);
});

test("cross wing: cut rows pool the valleys and jacks; bad wings are refused", () => {
  const l = layoutRoof(wingRoof(), plan());
  const rows = roofCuts(l);
  assert.equal(rows.filter((r) => r.kind === "valley rafter").reduce((s, r) => s + r.qty, 0), 2);
  assert.equal(rows.filter((r) => r.kind === "valley jack rafter").reduce((s, r) => s + r.qty, 0), 12 + 13);
  assert.match(roofText(l).join("\n"), /Cross wing/);
  assert.equal(layoutRoof(wingRoof({ width: 336 }), plan()).ok, false);
  assert.equal(layoutRoof(wingRoof({ at: 40 }), plan()).ok, false);
  assert.equal(layoutRoof({ ...wingRoof(), trusses: { spacing: 24 } }, plan()).ok, false);
  const t = takeoff(samplePlan(), rows);
  assert.ok(t.ok, JSON.stringify(t.errors));
});

test("cross wing: valley backing is one board per valley at the valley's length, and two wings double it", () => {
  assert.equal(layoutRoof(wingRoof(), plan()).valleyBacking.length, 0);
  const l = layoutRoof({ ...wingRoof(), valleyBacking: true }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  assert.equal(l.valleyBacking.length, 2);
  assert.ok(l.valleyBacking.every((b) => b.length === l.valleys[0].length && b.size === l.valleys[0].size));
  const rows = roofCuts(l);
  assert.equal(rows.filter((r) => r.kind === "valley backing").reduce((s, r) => s + r.qty, 0), 2);
  assert.equal(rows.filter((r) => r.kind === "valley rafter").reduce((s, r) => s + r.qty, 0), 2);
});

test("cross wing: ceiling joists span the wing on its wall stations", () => {
  const none = layoutRoof(wingRoof(), plan());
  assert.equal(none.wingCeilingJoists.length, 0);
  const l = layoutRoof({ ...wingRoof(), ceilingJoist: "2x6" }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  // stations u = 0.75 and 16..128 (9, all short of the 144 in wall end), each one 16 ft joist
  assert.equal(l.wingCeilingJoists.length, 9);
  assert.ok(l.wingCeilingJoists.every((x) => x.length === 192));
  const rows = roofCuts(l).filter((r) => r.kind === "ceiling joist");
  assert.equal(rows.reduce((s, r) => s + r.qty, 0), l.ceilingJoists.length + 9);
  assert.ok(takeoff(samplePlan(), roofCuts(l)).ok);
});

test("cross wing: collar ties on every other pair of wing commons, 24 in below the ridge", () => {
  assert.equal(layoutRoof(wingRoof(), plan()).wingCollarTies.length, 0);
  const l = layoutRoof({ ...wingRoof(), collarTies: true }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  // 9 common stations (0.75, 16..128): ties on the 1st, 3rd .. 9th = 5, each 1.5 + 2 x 24 x 12 / 4 = 145.5 in
  assert.equal(l.wingCollarTies.length, 5);
  assert.ok(l.wingCollarTies.every((x) => x.length === 145.5 && x.size === "2x4"));
  const rows = roofCuts(l).filter((r) => r.kind === "collar tie");
  assert.equal(rows.reduce((s, r) => s + r.qty, 0), l.collarTies.length + 5);
  assert.match(roofText(l).join("\n"), /5 wing collar ties/);
  const wide = layoutRoof({ ...wingRoof({ width: 96 }), collarTies: true }, plan());
  assert.equal(wide.wingCollarTies.length, 0);
});

// Wing pitch differs from the main roof: 16 ft wing at 3:12 on the 28 x 40 ft 4:12 main roof, 12 in eave overhang.
// Hand arithmetic: s = 3/4 = 0.75; the wing ridge meets the main plane e = 96 x 0.75 = 72 in inside the main wall;
// reach = 108, the valley reaches the wing eave first (s < 1) at yEnd = 108 in off the axis.
test("cross wing at another pitch: valley, ridge and wing rafters from the plane intersection", () => {
  const l = layoutRoof(wingRoof({ pitch: 3 }), plan());
  assert.equal(l.ok, true, JSON.stringify(l.errors));
  const kw = Math.sqrt(1 + 0.0625);
  // wing common: (96 - 0 + 12) x kw with a 1.5 in ridge board
  assert.ok(l.wingRafters.every((x) => Math.abs(x.length - (96 - 0.75 + 12) * kw) < 1 / 16));
  // valley: 108 x sqrt(1 + 0.75^2 + 0.25^2)
  assert.ok(Math.abs(l.valleyLength - 108 * Math.sqrt(1 + 0.5625 + 0.0625)) < 1 / 16);
  // wing ridge: 144 out + 72 inside the main wall + 12 rake
  assert.equal(l.wingRidges.reduce((a, x) => a + x.length, 0), 228);
  // the first valley jack stands past the eave line at 144 - 12 x 0.75 = 135: u = 144 is a jack with run (216 - 144) / 0.75 - 0.75
  const j = l.wingJacks.find((x) => x.u === 144);
  const cut = Math.sqrt(1 + 1 / 0.5625);
  assert.ok(Math.abs(j.length - (96 - 0.75 - 0.75 * cut) * kw) < 1 / 16);
  assert.match(l.notes.join(" "), /3:12 against the main roof's 4:12/);
});

test("cross wing at another pitch: the same pitch given explicitly changes nothing; a steep wing is refused", () => {
  const a = layoutRoof(wingRoof(), plan()), b = layoutRoof(wingRoof({ pitch: 4 }), plan());
  assert.equal(b.valleyLength, a.valleyLength);
  assert.equal(b.sheets.area, a.sheets.area);
  assert.equal(b.wingJacks.length, a.wingJacks.length);
  assert.equal(layoutRoof(wingRoof({ pitch: 30 }), plan()).ok, false);
  assert.equal(layoutRoof(wingRoof({ pitch: 0 }), plan()).ok, false);
});

test("cross wing at another pitch: area is the two wing planes less the main strip they cover", () => {
  const base = layoutRoof({ ...wingRoof(), wing: undefined }, plan());
  const l = layoutRoof(wingRoof({ pitch: 3 }), plan());
  // wing plan: 2 x integral over y = 0..108 of (12 + 144 + max(-12, (96 - y) x 0.75)); the valley meets the wing eave at y = 108
  const f = (y) => 12 + 144 + Math.max(-12, (96 - y) * 0.75);
  let wing = 0; const n = 108000; for (let i = 0; i < n; i++) wing += f((i + 0.5) * 108 / n) * 108 / n;
  let cover = 0; const m = 108000; for (let i = 0; i < m; i++) { const y = (i + 0.5) * 108 / m; cover += ((96 - y) * 0.75 + 12) * 108 / m; }
  const expect = base.sheets.area + (2 * wing * Math.sqrt(1 + 1 / 16) - 2 * cover * Math.sqrt(1 + 1 / 9)) / 144;
  assert.ok(Math.abs(l.sheets.area - expect) < 0.5, `${l.sheets.area} vs ${expect}`);
});

// two wings (T/cross plans): independent of each other when on opposite sides or well apart
test("two cross wings: opposite sides add exactly what each adds alone", () => {
  const base = layoutRoof({ ...wingRoof(), wing: undefined }, plan());
  const a = layoutRoof(wingRoof(), plan());
  const bw = { width: 144, projection: 96, at: 120, side: "left", valley: "2x8" };
  const b = layoutRoof({ ...wingRoof(), wing: bw }, plan());
  const both = layoutRoof({ ...wingRoof(), wing2: bw }, plan());
  assert.ok(both.ok, JSON.stringify(both.errors));
  assert.equal(both.wings.length, 2);
  for (const key of ["wingRafters", "wingJacks", "valleys", "wingRidges"]) assert.equal(both[key].length, a[key].length + b[key].length, key);
  assert.equal(both.rafters.filter((x) => x.kind).length, a.rafters.filter((x) => x.kind).length + b.rafters.filter((x) => x.kind).length);
  assert.ok(Math.abs(both.sheets.area - (a.sheets.area + b.sheets.area - base.sheets.area)) < 1e-6);
  assert.ok(Math.abs(both.roofing.valleyFeet - (a.roofing.valleyFeet + b.roofing.valleyFeet)) < 1e-9);
  assert.ok(Math.abs(both.roofing.eaveFeet - (a.roofing.eaveFeet + b.roofing.eaveFeet - base.roofing.eaveFeet)) < 1e-9);
  assert.match(roofText(both).join("\n"), /Cross wing[^\n]*\n[^\n]*Cross wing/);
});

test("two cross wings: same side needs room along the ridge; wing2 needs wing", () => {
  const w2 = { width: 144, projection: 96, at: 280, side: "right" };
  assert.equal(layoutRoof({ ...wingRoof(), wing2: w2 }, plan()).ok, false);
  assert.equal(layoutRoof({ ...wingRoof(), wing2: { ...w2, width: 96, at: 420 } }, plan()).ok, true);
  assert.equal(layoutRoof({ ...wingRoof(), wing: undefined, wing2: w2 }, plan()).ok, false);
});

test("birdsmouth: 2x8 at 4:12 on a 3-1/2 in plate matches hand arithmetic", () => {
  const b = birdsmouth("2x8", 4);
  assert.ok(Math.abs(b.plumb - 3.5 * 4 / 12) < 1e-9); // 1.1667 in
  assert.ok(Math.abs(b.notch - (7 / 6) / Math.sqrt(10) * 3) < 1e-9); // 1.1667 / 1.05409
  assert.ok(b.ok && b.fraction < 0.25);
  // 0.25 x 7.25 x 1.05409 x 12 / 4 = 5.731 in of bearing would just reach a quarter of the depth
  assert.ok(Math.abs(b.maxBearing - 0.25 * 7.25 * Math.sqrt(10) / 3 * 3) < 1e-9);
});

test("birdsmouth: a 12:12 roof on a 2x6 over a 3-1/2 in plate is flagged in the layout and the text", () => {
  const l = layoutRoof({ ...sampleRoof(), pitch: 12, width: 168, rafter: "2x6", ceilingJoist: undefined, collarTies: false }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  assert.equal(l.birdsmouth.ok, false); // notch 3.5/sqrt2 = 2.47 in of 5.5 = 45%
  assert.ok(l.notes.some((n) => /birdsmouth/.test(n)));
  assert.ok(roofText(l).some((t) => /Birdsmouth/.test(t)));
  const ok = layoutRoof(sampleRoof(), plan());
  assert.equal(ok.birdsmouth.ok, true);
});

test("cross wing: main courses are shortened under the wing, and the sheet count stays between the area bound and the old count", () => {
  const r = wingRoof();
  const l = layoutRoof(r, plan());
  const sheetArea = (48 * 96) / 144;
  assert.ok(l.sheets.count >= Math.ceil(l.sheets.area / sheetArea - 1e-9));
  // hand check, wing 192 wide, 6:12... main 4:12 same pitch (s = 1): xEnd = e + overhang = 96 + 12 = 108;
  // first course (top edge 48 / k up the slope = 45.5 in of run) loses 2 x min(108, 108 - 45.5) = 125 in of its right-hand plane
  const k = Math.sqrt(10) / 3;
  const cw = Math.min(108, 108 - 48 / k);
  const c0 = l.planeCourses.right[0], whole = layoutRoof({ ...r, wing: undefined }, plan()).courses[0];
  const kept = c0.pieces.reduce((s, p) => s + p.length, 0), all = whole.pieces.reduce((s, p) => s + p.length, 0);
  assert.ok(Math.abs(all - kept - 2 * cw) < 1e-6, `${all} ${kept} ${cw}`);
  assert.equal(l.planeCourses.left[0].pieces.reduce((s, p) => s + p.length, 0), all); // the far plane is whole
});

test("roofing nails by hand: 320 per square, 150 per lb, 30 lb boxes", () => {
  const l = layoutRoof(sampleRoof(), plan());
  const nails = Math.ceil(l.roofing.squares * 1.1 * 320 - 1e-9);
  assert.equal(l.roofing.nails, nails);
  assert.ok(Math.abs(l.roofing.nailLb - nails / 150) < 1e-9);
  assert.equal(l.roofing.nailBoxes, Math.ceil(nails / 150 / 30 - 1e-9));
  const t = layoutRoof({ ...sampleRoof(), roofing: { nailsPerSquare: 400, nailsPerLb: 100, nailBoxLb: 5 } }, plan());
  assert.equal(t.roofing.nails, Math.ceil(t.roofing.squares * 1.1 * 400 - 1e-9));
  assert.equal(t.roofing.nailBoxes, Math.ceil(t.roofing.nails / 100 / 5 - 1e-9));
  assert.match(roofText(l).join("\n"), /lb of roofing nails/);
});

test("roof sheathing nails: 4 x 8 sheet, rafters at 16 in = 48 edge + 2 lines x 8 field = 64 per sheet, plus 10%", () => {
  const l = layoutRoof(sampleRoof(), plan());
  assert.equal(l.sheets.nailsPerSheet, 64); // 288 in perimeter / 6 = 48; ceil(48/16) - 1 = 2 lines x 96/12 = 16
  assert.equal(l.sheets.nails, Math.ceil(64 * l.sheets.count * 1.1 - 1e-9));
  const t = layoutRoof({ ...sampleRoof(), sheet: { edgeNailSpacing: 4, fieldNailSpacing: 8 } }, plan());
  assert.equal(t.sheets.nailsPerSheet, 72 + 2 * 12);
});

test("roof sheathing H-clips: opt-in, one per 16 in bay along a 96 in edge = 6 per sheet, plus 10%", () => {
  const off = layoutRoof(sampleRoof(), plan());
  assert.equal(off.sheets.clips, undefined);
  const l = layoutRoof({ ...sampleRoof(), sheet: { clips: true, clipPrice: 0.5 } }, plan());
  assert.equal(l.sheets.clipsPerSheet, 6);
  assert.equal(l.sheets.clips, Math.ceil(6 * l.sheets.count * 1.1 - 1e-9));
  assert.equal(l.sheets.clipCost, l.sheets.clips * 0.5);
  assert.equal(layoutRoof({ ...sampleRoof(), spacing: 24, sheet: { clips: true } }, plan()).sheets.clipsPerSheet, 4);
});

test("underlayment cap nails: opt-in, typed per-square rate x squares x waste, boxes of 2000", () => {
  assert.equal(layoutRoof(sampleRoof(), plan()).roofing.underlaymentNails, undefined);
  const g = layoutRoof({ ...sampleRoof(), roofing: { underlaymentNailsPerSquare: 100 } }, plan()).roofing;
  assert.equal(g.underlaymentNails, Math.ceil(g.squares * g.waste * 100 - 1e-9));
  assert.equal(g.underlaymentNailBoxes, Math.ceil(g.underlaymentNails / 2000 - 1e-9));
  assert.equal(layoutRoof({ ...sampleRoof(), roofing: { underlaymentNailsPerSquare: 100, underlaymentNailBox: 500 } }, plan()).roofing.underlaymentNailBoxes, Math.ceil(g.underlaymentNails / 500 - 1e-9));
  assert.equal(layoutRoof({ ...sampleRoof(), roofing: { underlaymentNailsPerSquare: -1 } }, plan()).roofing.underlaymentNails, undefined);
});

test("ice and water shield: opt-in, 24 in inside the wall, by hand", () => {
  const off = layoutRoof(sampleRoof(), plan());
  assert.equal(off.roofing.iceShieldRolls, undefined);
  const l = layoutRoof({ ...sampleRoof(), roofing: { iceShield: 24 } }, plan());
  const k = Math.sqrt(1 + (4 / 12) ** 2), area = l.roofing.eaveFeet * (12 + 24) * k / 12;
  assert.ok(Math.abs(l.roofing.iceShieldArea - area) < 1e-6);
  assert.equal(l.roofing.iceShieldRolls, Math.ceil(area * 1.1 / 200 - 1e-9));
  const t = layoutRoof({ ...sampleRoof(), roofing: { iceShield: 36, iceShieldRoll: 100, iceShieldWaste: 1 } }, plan());
  assert.equal(t.roofing.iceShieldRolls, Math.ceil(t.roofing.eaveFeet * (12 + 36) * k / 12 / 100 - 1e-9));
  const h = layoutRoof(hipRoof({ roofing: { iceShield: 24 } }), plan());
  assert.ok(h.roofing.iceShieldRolls >= 1);
  assert.match(roofText(l).join("\n"), /ice and water shield/);
});

test("valley flashing rolls: two valleys per wing, 10% waste, 50 ft rolls, by hand", () => {
  const l = layoutRoof(wingRoof(), plan());
  assert.equal(l.roofing.valleyFlashingRolls, Math.ceil(l.roofing.valleyFeet * 1.1 / 50 - 1e-9));
  assert.ok(Math.abs(l.roofing.valleyFeet - 2 * l.wing.valleyLength / 12) < 1e-9);
  const t = layoutRoof({ ...wingRoof(), roofing: { valleyRollFeet: 10, valleyWaste: 1 } }, plan());
  assert.equal(t.roofing.valleyFlashingRolls, Math.ceil(t.roofing.valleyFeet / 10 - 1e-9));
  assert.equal(layoutRoof(sampleRoof(), plan()).roofing.valleyFlashingRolls, undefined);
});

test("pipe boots: the typed count plus one spare, nothing when not typed", () => {
  assert.equal(layoutRoof(sampleRoof(), plan()).roofing.pipeBoots, undefined);
  assert.equal(layoutRoof({ ...sampleRoof(), roofing: { pipeBoots: 3 } }, plan()).roofing.pipeBoots, 4);
  assert.equal(layoutRoof({ ...sampleRoof(), roofing: { pipeBoots: 3, pipeBootSpares: 0 } }, plan()).roofing.pipeBoots, 3);
  assert.equal(layoutRoof(hipRoof({ roofing: { pipeBoots: 2 } }), plan()).roofing.pipeBoots, 3);
  assert.equal(layoutRoof({ ...sampleRoof(), roofing: { pipeBoots: 2.5 } }, plan()).roofing.pipeBoots, undefined);
});

test("ridge cap and starter nails by hand, opt-in", () => {
  const base = layoutRoof(sampleRoof(), plan());
  const l = layoutRoof({ ...sampleRoof(), roofing: { capNailsPerFoot: 4, starterNailsPerFoot: 2 } }, plan());
  const r = base.roofing, w = r.nails === base.roofing.nails ? 1.1 : 1.1;
  const cap = Math.ceil(r.ridgeFeet * 4 * w - 1e-9), st = Math.ceil(r.eaveFeet * 2 * w - 1e-9);
  assert.equal(l.roofing.capNails, cap);
  assert.equal(l.roofing.starterNails, st);
  assert.equal(l.roofing.nails, r.nails + cap + st);
  assert.equal(base.roofing.underlaymentNails, undefined);
});

test("drip edge nails: opt-in, typed spacing along eave and rake plus one per piece, by hand", () => {
  assert.equal(layoutRoof(sampleRoof(), plan()).roofing.dripEdgeNails, undefined);
  const g = layoutRoof({ ...sampleRoof(), roofing: { dripEdgeNailSpacing: 12 } }, plan()).roofing;
  assert.equal(g.dripEdgeNails, Math.ceil((g.eaveFeet + g.rakeFeet) * 12 / 12 - 1e-9) + g.dripEdgePieces);
  assert.ok(g.dripEdgeNails > 0);
  const h = layoutRoof(hipRoof({ roofing: { dripEdgeNailSpacing: 10 } }), plan()).roofing;
  assert.equal(h.dripEdgeNails, Math.ceil(h.eaveFeet * 12 / 10 - 1e-9) + h.dripEdgePieces);
  assert.equal(layoutRoof({ ...sampleRoof(), roofing: { dripEdgeNailSpacing: 0 } }, plan()).roofing.dripEdgeNails, undefined);
});

test("drip edge nail boxes: only when a box size is typed, boxes round up, by hand", () => {
  const r = (roofing) => layoutRoof({ ...sampleRoof(), roofing }, plan()).roofing;
  assert.equal(r({ dripEdgeNailSpacing: 12 }).dripEdgeNailBoxes, undefined);
  const g = r({ dripEdgeNailSpacing: 12, dripEdgeNailBox: 100 });
  assert.equal(g.dripEdgeNailBoxes, Math.ceil(g.dripEdgeNails / 100 - 1e-9));
  assert.equal(r({ dripEdgeNailSpacing: 12, dripEdgeNailBox: g.dripEdgeNails }).dripEdgeNailBoxes, 1);
  assert.equal(r({ dripEdgeNailSpacing: 12, dripEdgeNailBox: g.dripEdgeNails - 1 }).dripEdgeNailBoxes, 2);
  assert.equal(r({ dripEdgeNailBox: 100 }).dripEdgeNailBoxes, undefined);
});

test("roof sheathing nail boxes: typed box size only, whole boxes (hand check)", () => {
  assert.equal(layoutRoof(sampleRoof(), plan()).sheets.nailBoxes, undefined);
  const l = layoutRoof({ ...sampleRoof(), sheet: { nailBox: 500 } }, plan());
  assert.equal(l.sheets.nailBoxes, Math.ceil(l.sheets.nails / 500 - 1e-9));
  assert.ok(l.notes.some((n) => /nail boxes: \d+ nails in boxes of 500/.test(n)));
  assert.equal(layoutRoof({ ...sampleRoof(), sheet: { nailBox: 0 } }, plan()).sheets.nailBoxes, undefined);
  const c = layoutRoof({ ...sampleRoof(), sheet: { nailBox: 500, clips: true } }, plan());
  assert.ok(c.notes.some((n) => /H-clips/.test(n)) && c.notes.some((n) => /nail boxes/.test(n)));
});

test("layoutRoof, layoutSiding, layoutTrim and the opening fixers refuse null input with a reason, not a TypeError", async () => {
  const { layoutRoof } = await import("./roof.mjs");
  const { layoutSiding } = await import("./siding.mjs");
  const { layoutTrim } = await import("./trim.mjs");
  const { shallowHeaders, trimOpenings, doorsToFloor } = await import("./shallowheaders.mjs");
  for (const bad of [null, undefined, 5, "x", []]) {
    assert.equal(layoutRoof(bad, {}).ok, false);
  }
  assert.equal(layoutRoof({ width: 300, length: 480, pitch: 6 }, null).ok, false);
  assert.equal(layoutSiding({}, undefined).ok, false);
  assert.equal(layoutTrim({}, undefined).ok, false);
  for (const f of [shallowHeaders, trimOpenings, doorsToFloor]) assert.deepEqual(f(null), []);
});

test("typed roofing settings are refused when they would order nonsense (2026-11-08)", () => {
  // before: waste -1 ordered -39 shingle bundles, a 0 roll length or box weight gave null counts
  const bad = [
    [{ roofing: { waste: -1 } }, /waste/], [{ roofing: { bundlesPerSquare: 0 } }, /bundlesPerSquare/],
    [{ roofing: { nailsPerLb: "x" } }, /nailsPerLb/], [{ roofing: { underlaymentRoll: 0 } }, /underlaymentRoll/],
    [{ roofing: { nailBoxLb: 0 } }, /nailBoxLb/], [{ roofing: 5 }, /roofing settings/],
  ];
  for (const [ov, re] of bad) {
    const l = layoutRoof({ ...sampleRoof(), ...ov }, plan());
    assert.equal(l.ok, false, JSON.stringify(ov));
    assert.ok(l.errors.some((m) => re.test(m)), JSON.stringify(ov) + " " + JSON.stringify(l.errors));
  }
  const good = layoutRoof({ ...sampleRoof(), roofing: { waste: 1.1, bundlesPerSquare: 3, underlaymentRoll: 400 } }, plan());
  assert.ok(good.ok, JSON.stringify(good.errors));
});

test("uplift connectors: demand = (pressure - dead) x spacing x (half span + overhang), counts round up (hand arithmetic)", () => {
  // 28 ft span, 12 in overhang: depth = (168 + 12) / 12 = 15 ft; spacing 16 in; net 20 - 5 = 15 psf
  // demand = 15 x (16/12) x 15 = 300 lb per end; capacity 175 lb -> 2 per end; 62 rafter ends -> 124
  const l = layoutRoof({ ...sampleRoof(), uplift: { pressure: 20, deadLoad: 5, capacity: 175, connector: "H2.5A" } }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  assert.ok(Math.abs(l.uplift.demand - 300) < 1e-9);
  assert.equal(l.uplift.perEnd, 2);
  assert.equal(l.uplift.total, 124);
  assert.ok(Math.abs(l.uplift.utilization - 300 / 350) < 1e-9);
  // one connector holds 175 / (15 x 15) ft = 0.7778 ft = 9.33 in, to 1/16
  assert.ok(Math.abs(l.uplift.maxSpacingOneConnector - 9.3125) < 1e-9);
  assert.ok(roofText(l).some((t) => t.includes("2 per end, 124 in all")));
});

test("uplift: one connector when it holds, trusses count both ends, no figures assumed, hip ignored", () => {
  const one = layoutRoof({ ...sampleRoof(), uplift: { pressure: 10, capacity: 1000 } }, plan());
  assert.equal(one.uplift.perEnd, 1);
  const tr = layoutRoof({ ...sampleRoof(), ceilingJoist: undefined, collarTies: false, ridge: null, trusses: { spacing: 24 }, uplift: { pressure: 10, capacity: 1000 } }, plan());
  assert.equal(tr.uplift.total, 2 * tr.trusses.count);
  const miss = layoutRoof({ ...sampleRoof(), uplift: { pressure: 10 } }, plan());
  assert.equal(miss.ok, false);
  assert.ok(miss.errors.some((e) => e.includes("capacity")));
  const none = layoutRoof({ ...sampleRoof(), uplift: { pressure: 5, deadLoad: 9, capacity: 100 } }, plan());
  assert.equal(none.uplift.demand, 0);
  assert.equal(none.uplift.perEnd, 1);
  assert.equal(layoutRoof(sampleRoof(), plan()).uplift, undefined);
});

test("uplift on a hip roof is ignored with a note, not guessed", () => {
  const l = layoutRoof({ ...sampleRoof(), shape: "hip", length: 480, ridge: null, ceilingJoist: undefined, collarTies: false, uplift: { pressure: 20, capacity: 175 } }, plan());
  if (l.ok) { assert.equal(l.uplift, undefined); assert.ok(l.notes.some((n) => n.includes("not sized for hip roofs"))); }
});

test("2026-11-09: validateRoof reports a missing stock list instead of throwing", async () => {
  const { validateRoof } = await import("./roof.mjs");
  const r = { ...sampleRoof(), wing: { width: 120, projection: 120, valley: "2x8" } };
  assert.doesNotThrow(() => validateRoof(r));
  assert.ok(validateRoof(r).some((m) => /No 2x8 boards/.test(m)));
});
