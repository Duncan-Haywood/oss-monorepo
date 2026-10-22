import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { layoutRoof, roofCuts, sampleRoof, roofText, slopeFactor } from "./roof.mjs";

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

// L-shaped roof: 24 x 40 ft main at 6:12, 16 ft wide wing projecting 12 ft, centred at 20 ft
const lroof = (over = {}) => ({ id: "L", shape: "lshape", width: 288, length: 480, pitch: 6, overhang: 12, gableOverhang: 12, rafter: "2x8", valley: "2x10", spacing: 16, ridge: "2x10", wing: { width: 192, projection: 144, at: 240 }, ...over });

test("L-shaped roof: valley length, wing commons and surface area match closed forms", () => {
  const l = layoutRoof(lroof(), plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  const k = slopeFactor(6), hz = 96 + 12;
  assert.ok(Math.abs(l.valleyLength - hz * Math.sqrt(2 + 0.25)) < 1 / 16);
  assert.equal(l.valleys.length, 2);
  assert.ok(Math.abs(l.wingRafterLength - (96 - 0.75 + 12) * k) < 1 / 16);
  // plan area = main rectangle + the wing beyond the eave line; surface = plan x slope factor
  const plan_ = 504 * 312 + (144 - 12 + 12) * 216;
  assert.ok(Math.abs(l.sheets.area - plan_ * k / 144) < 1e-6);
  assert.ok(l.sheets.count * 32 >= l.sheets.area);
});

test("L-shaped roof: valley jacks follow the horizontal run to the valley", () => {
  const l = layoutRoof(lroof(), plan());
  const k = slopeFactor(6), vOff = 0.75 * Math.SQRT2;
  // wing jacks: ridge-side run d - 0.75 - vOff for d = P + Ww/2 - centre
  const wj = l.jacks.filter((j) => j.plane === "wing" && j.side === "left");
  assert.ok(wj.length >= 5);
  for (const j of wj) assert.ok(Math.abs(j.length - (j.offset - 0.75 - vOff) * k) < 1 / 16);
  // main jacks: run (W - Ww)/2 + z - ridge/2 - vOff, one per rafter line inside the wing's zone
  const mj = l.jacks.filter((j) => j.plane === "main");
  assert.ok(mj.length >= 12);
  for (const j of mj) assert.ok(Math.abs(j.length - ((288 - 192) / 2 + j.offset - 0.75 - vOff) * k) < 1 / 16);
  // a jack never exceeds the full common it replaces
  const common = l.rafterLength;
  for (const j of mj) assert.ok(j.length <= common + 1e-6);
  // rafters + jacks cover the same lines as the plain gable plus the wing
  const gable = layoutRoof({ ...lroof(), shape: "gable", wing: undefined }, plan());
  assert.equal(l.rafters.filter((x) => !x.wing).length + mj.length, gable.rafters.length);
});

test("L-shaped roof: wing ridge, roofing and the cut list", () => {
  const l = layoutRoof(lroof(), plan());
  assert.equal(l.ridges.filter((x) => x.wing).reduce((s, x) => s + x.length, 0), 144 + 96 + 12);
  assert.ok(l.roofing.valleyFeet > 0);
  const cuts = roofCuts(l);
  assert.ok(cuts.some((c) => c.kind === "valley rafter" && c.qty === 2));
  assert.ok(cuts.some((c) => c.kind === "valley jack"));
  const t = takeoff(samplePlan(), cuts);
  assert.ok(t.ok, JSON.stringify(t.errors));
  assert.match(roofText(l).join("\n"), /L-shaped roof/);
});

test("L-shaped roof: refuses a wing wider than the main roof, one that does not fit, and trusses", () => {
  assert.equal(layoutRoof(lroof({ wing: { width: 300, projection: 144 } }), plan()).ok, false);
  assert.match(layoutRoof(lroof({ wing: { width: 192, projection: 144, at: 60 } }), plan()).errors[0], /does not fit/);
  assert.equal(layoutRoof(lroof({ trusses: {} }), plan()).ok, false);
  assert.equal(layoutRoof(lroof({ wing: undefined }), plan()).ok, false);
});
