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
