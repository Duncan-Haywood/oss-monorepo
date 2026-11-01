import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { layoutGutters, validateGutters, guttersText } from "./gutters.mjs";

const plan = () => ({ ...samplePlan(), walls: [] });
const gable = () => layoutRoof(sampleRoof(), plan());

test("gable gutters by hand: two 504 in runs", () => {
  const g = layoutGutters({ waste: 0 }, gable());
  assert.ok(g.ok, JSON.stringify(g.errors));
  assert.equal(g.runFeet, 84);
  assert.equal(g.gutters, 9); // 504 = 4 x 120 + 24 per run: 8 full sections, the two 24s share a ninth
  assert.equal(g.endCaps, 4);
  assert.equal(g.outsideCorners, 0);
  assert.equal(g.hangers, 2 * (Math.floor(504 / 24) + 1)); // 44
  // 42 ft run > 40 ft: two downspouts per run
  assert.equal(g.downspouts, 4);
  assert.equal(g.downspoutPieces, 4); // 10 ft drop, 10 ft stock
  assert.equal(g.elbows, 8);
  assert.equal(g.straps, 4 * (Math.floor(120 / 72) + 1));
});

test("a hip roof gets four runs and four outside corners", () => {
  const roof = layoutRoof({ ...sampleRoof(), shape: "hip", hip: "2x8", width: 240, length: 360 }, plan());
  const g = layoutGutters({ waste: 0 }, roof);
  assert.equal(g.runs, 4);
  assert.equal(g.outsideCorners, 4);
  assert.equal(g.runFeet, (2 * 384 + 2 * 264) / 12);
  assert.equal(g.endCaps, 8);
});

test("roof area can add downspouts beyond the run-length rule", () => {
  const lo = layoutGutters({ waste: 0, maxRunFeet: 80, sqFtPerDownspout: 2000 }, gable());
  const hi = layoutGutters({ waste: 0, maxRunFeet: 80, sqFtPerDownspout: 300 }, gable());
  assert.equal(lo.downspouts, 2);
  assert.ok(hi.downspouts > lo.downspouts);
});

test("taller eaves take more downspout pieces; prices total", () => {
  const g = layoutGutters({ waste: 0, eaveHeight: 250, gutterPrice: 10, downspoutPrice: 8, hangerPrice: 1, capPrice: 2, elbowPrice: 3, cornerPrice: 5, strapPrice: 0.5 }, gable());
  assert.equal(g.downspoutPieces, g.downspouts * 3);
  const want = g.gutters * 10 + g.downspoutPieces * 8 + g.hangers + g.endCaps * 2 + g.elbows * 3 + g.straps * 0.5;
  assert.ok(Math.abs(g.cost - want) < 1e-9);
});

test("bad input and a missing roof are errors", () => {
  assert.equal(validateGutters({ hangerSpacing: 3, waste: 0.9 }).length, 2);
  assert.equal(layoutGutters({}, null).ok, false);
  assert.equal(layoutGutters({ waste: 2 }, gable()).ok, false);
  assert.ok(guttersText(layoutGutters({}, gable())).length >= 4);
});

test("a cross wing swaps 168 in of main eave for its own two eave runs", () => {
  const roof = layoutRoof({ ...sampleRoof(), wing: { width: 144, projection: 192, side: "right", at: 240 } }, plan());
  const base = layoutGutters({ waste: 0 }, gable());
  const g = layoutGutters({ waste: 0 }, roof);
  assert.ok(g.ok, JSON.stringify(g.errors));
  const er = roof.wings[0].eaveLineRun;
  assert.equal(g.wings, 1);
  assert.equal(g.runs, 4);
  assert.equal(er, 192); // 12 rake + 192 out - 12 overhang, as in eaves.test
  assert.equal(g.runFeet, 102); // 1008 - 168 + 2 x 192 = 1224 in, the same as the fascia run
  assert.equal(g.endCaps, 8);
  assert.ok(g.planSqFt > base.planSqFt);
  assert.ok(g.downspouts >= base.downspouts);
});

test("a wing at a different pitch is noted, not counted, in gutters", () => {
  const roof = layoutRoof({ ...sampleRoof(), wing: { width: 144, projection: 192, side: "right", at: 240, pitch: 3 } }, plan());
  const g = layoutGutters({ waste: 0 }, roof);
  assert.equal(g.wings, 0);
  assert.equal(g.runs, 2);
  assert.match(g.wingNotes[0], /own pitch/);
});
