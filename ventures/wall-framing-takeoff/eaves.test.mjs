import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { layoutEaves, validateEaves, eavesText } from "./eaves.mjs";

const plan = () => ({ ...samplePlan(), walls: [] });
const gable = () => layoutRoof(sampleRoof(), plan());

test("gable eaves by hand: 2 x 504 in of eave, 4 rakes up a 189.74 in slope", () => {
  const e = layoutEaves({ waste: 0 }, gable());
  assert.ok(e.ok, JSON.stringify(e.errors));
  assert.equal(e.eaveFeet, 84); // 2 x (480 + 24) in
  assert.ok(Math.abs(e.rakeFeet - 4 * 180 * Math.sqrt(10) / 3 / 12) < 0.01);
  assert.equal(e.eaveCourses, 1); // 12 in overhang, 12 in panels
  assert.equal(e.soffitSqFt, 84); // 1008 in x 12 in / 144
  assert.equal(e.panels, 7); // each 504 = 3 x 144 + 72; the two 72s share a board
  assert.equal(e.channel, 7);
  // fascia: 2 x (192, 192, 120) and four 189.74 pieces: 4 full + 4 slope boards + 2 for the 120s
  assert.equal(e.fascia, 10);
});

test("a deeper overhang takes more courses; a rake soffit adds to the area", () => {
  const roof = layoutRoof({ ...sampleRoof(), width: 288, overhang: 24, gableOverhang: 12 }, plan());
  const e = layoutEaves({ waste: 0, rakeSoffit: true }, roof);
  assert.equal(e.eaveCourses, 2);
  assert.equal(e.rakeCourses, 1);
  const rakeIn = 4 * roof.slope; // 4 slopes up the roof
  assert.ok(Math.abs(e.soffitSqFt - ((2 * 504 * 24 + rakeIn * 12) / 144)) < 1e-6);
});

test("a hip roof runs eaves on four sides and has no rakes", () => {
  const roof = layoutRoof({ ...sampleRoof(), shape: "hip", hip: "2x8", width: 240, length: 360 }, plan());
  const e = layoutEaves({ waste: 0 }, roof);
  assert.ok(e.ok, JSON.stringify(e.errors));
  assert.equal(e.shape, "hip");
  assert.equal(e.rakeFeet, 0);
  assert.equal(e.eaveFeet, (2 * 384 + 2 * 264) / 12);
  assert.equal(e.soffitSqFt, 108); // 1296 in of eave x 12 in
});

test("waste, prices, text, and bad input", () => {
  const e = layoutEaves({ panelPrice: 10, fasciaPrice: 20, channelPrice: 5 }, gable());
  assert.equal(e.panels, Math.ceil(7 * 1.1 - 1e-9)); // 8
  assert.equal(e.cost, e.panels * 10 + e.fascia * 20 + e.channel * 5);
  assert.ok(eavesText(e).length >= 4);
  assert.equal(validateEaves({ panelWidth: 2 }).length, 1);
  assert.equal(layoutEaves({}, null).ok, false);
  assert.equal(layoutEaves({ waste: 0.9 }, gable()).ok, false);
});

test("a cross wing swaps 168 in of main eave for its own two eaves and two rakes (by hand)", () => {
  const wing = { width: 144, projection: 192, side: "right", at: 240 };
  const roof = layoutRoof({ ...sampleRoof(), wing }, plan());
  assert.ok(roof.ok, JSON.stringify(roof.errors));
  const e = layoutEaves({ waste: 0 }, roof);
  assert.ok(e.ok, JSON.stringify(e.errors));
  // eaves: 504 + (504 - (144 + 2 x 12)) + 2 x (12 rake + 192 out - 12 overhang) = 504 + 336 + 384 = 1224 in
  assert.equal(e.wings, 1);
  assert.equal(e.eaveFeet, 102);
  // rakes: the main roof's four plus two wing slopes of (72 + 12) in run at 4/12... slope factor from the roof
  const k = roof.slope / (roof.width / 2 + roof.overhang);
  assert.ok(Math.abs(e.rakeFeet - (4 * roof.slope + 2 * 84 * k) / 12) < 0.05);
  assert.ok(e.soffitSqFt > 84);
});

test("a wing at a different pitch is noted, not counted", () => {
  const roof = layoutRoof({ ...sampleRoof(), wing: { width: 144, projection: 192, side: "right", at: 240, pitch: 3 } }, plan());
  if (!roof.ok) return;
  const e = layoutEaves({ waste: 0 }, roof);
  assert.equal(e.wings, 0);
  assert.match(eavesText(e).join("\n"), /own pitch/);
});
