import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tryOn, sleeveCheck, frontWidth, LANDMARKS } from "./tryon.mjs";

test("front width: a circle-ish ratio 1 gives circumference / pi", () => {
  assert.ok(Math.abs(frontWidth(100, 1) - 100 / Math.PI) < 1e-9);
  assert.ok(frontWidth(100, 0.7) > 33 && frontWidth(100, 0.7) < 41);
});

test("regular tee on a size-M body: 12 cm of chest ease, hem covers the hips", () => {
  const r = tryOn({ chest: 100, waist: 88, hip: 100, height: 178 });
  assert.equal(r.ok, true);
  assert.equal(r.checks[0].ease, 12);
  assert.equal(r.checks[0].word, "regular");
  assert.equal(r.checks[1].ease, 24);
  assert.equal(r.checks[2].ease, 12);
  assert.match(r.length.word, /hip/);
  assert.deepEqual(r.assumed, []);
});

test("garment is wider than the body at the chest by the ease, in front view", () => {
  const r = tryOn({ chest: 100, height: 175 });
  assert.ok(r.garmentWidths.chest > r.bodyWidths.chest);
  const slim = tryOn({ chest: 100, height: 175 }, { fit: "slim" });
  assert.ok(slim.garmentWidths.chest < r.garmentWidths.chest);
});

test("missing waist, hip and height are assumed and said so", () => {
  const r = tryOn({ chest: 100 });
  assert.equal(r.height, 175);
  assert.equal(r.assumed.length, 3);
  assert.ok(r.notes.some(n => /assumed/.test(n)));
});

test("hips wider than the hem warn that it rides up and suggest asking the factory", () => {
  const r = tryOn({ chest: 92, hip: 112, height: 170 }, { size: "S", fit: "slim" });
  assert.ok(r.checks[2].ease < 0);
  assert.match(r.checks[2].word, /ride up/);
  assert.ok(r.notes.some(n => /hem/.test(n)));
});

test("a short person gets a longer-looking hem than a tall one in the same size", () => {
  const short = tryOn({ chest: 100, height: 155 }), tall = tryOn({ chest: 100, height: 195 });
  assert.match(short.length.word, /long|covers/);
  assert.ok(tall.length.hemFromFloor / 195 > short.length.hemFromFloor / 155);
});

test("bad input is refused, not guessed", () => {
  assert.equal(tryOn({ chest: 20 }).ok, false);
  assert.equal(tryOn({ chest: "x" }).ok, false);
  assert.equal(tryOn({ chest: 100 }, { size: "XXXL" }).ok, false);
  assert.equal(tryOn(null).ok, false);
});

test("svg is well formed, numeric-only and has no scripts or user text", () => {
  const r = tryOn({ chest: 100, waist: 90, hip: 102, height: 180 }, { garment: "hoodie" });
  assert.match(r.svg, /^<svg[^>]*viewBox="0 0 120 [\d.]+"/);
  assert.ok(!/NaN|undefined|<script/.test(r.svg));
  assert.equal((r.svg.match(/<path/g) || []).length, 6);
  for (const k of Object.keys(LANDMARKS)) assert.ok(LANDMARKS[k] > 0 && LANDMARKS[k] < 1);
});

test("fit.html wires the try-on panel", () => {
  const html = readFileSync(new URL("./fit.html", import.meta.url), "utf8");
  assert.match(html, /import \{[^}]*tryOn[^}]*\} from "\.\/tryon\.mjs"/);
  assert.match(html, /id="tryon"/);
});

test("sleeve: a long-sleeve at M on a 178 cm person ends near the wrist; a short person gets a long sleeve", () => {
  const avg = tryOn({ chest: 100, height: 178 }, { garment: "longsleeve" });
  assert.match(avg.sleeve.word, /wrist/);
  const short = tryOn({ chest: 100, height: 150 }, { garment: "longsleeve" });
  assert.ok(short.sleeve.pastWrist > 8);
  assert.match(short.sleeve.word, /over the hand/);
  assert.ok(short.notes.some(n => /past your wrist/.test(n)));
  const tall = sleeveCheck("longsleeve", "M", 215);
  assert.match(tall.word, /short/);
});

test("sleeve: tee sleeves read as upper arm, grow a cm per size", () => {
  assert.match(sleeveCheck("tee", "M", 175).word, /upper arm|elbow/);
  assert.equal(sleeveCheck("tee", "L", 175).sleeveCm - sleeveCheck("tee", "M", 175).sleeveCm, 1);
});

test("side view: garment is deeper than the body by the ease; svg is clean", () => {
  const r = tryOn({ chest: 100, waist: 88, hip: 100, height: 178 });
  assert.equal(r.side.depths.length, 3);
  assert.ok(r.side.depths[0].extra > 0);
  const slim = tryOn({ chest: 100, waist: 88, hip: 100, height: 178 }, { fit: "slim" });
  assert.ok(slim.side.depths[0].extra < r.side.depths[0].extra);
  assert.ok(!/NaN|undefined|<script/.test(r.side.svg));
  assert.match(r.side.svg, /^<svg[^>]*viewBox="0 0 120 /);
});

test("a measured arm replaces the height rule for the sleeve verdict", () => {
  const avg = sleeveCheck("longsleeve", "M", 175);
  assert.equal(avg.armMeasured, false);
  const long = sleeveCheck("longsleeve", "M", 175, 70); // long arms: sleeve 63 ends well short
  assert.equal(long.armMeasured, true);
  assert.equal(long.wristFromShoulder, 70);
  assert.equal(long.pastWrist, -7);
  assert.match(long.word, /short/);
  const short = sleeveCheck("longsleeve", "M", 175, 50);
  assert.match(short.word, /hand/);
  assert.equal(sleeveCheck("longsleeve", "M", 175, 12).armMeasured, false); // out of range ignored
});

test("tryOn uses body.arm and says when it differs from the height average", () => {
  const r = tryOn({ chest: 100, height: 175, arm: 70 }, { garment: "longsleeve" });
  assert.equal(r.sleeve.armMeasured, true);
  assert.ok(r.notes.some(n => /Your arm/.test(n)));
});

test("a factory sleeve length at M replaces the typical figure", () => {
  const typ = sleeveCheck("longsleeve", "M", 175);
  assert.equal(typ.fromFactory, false);
  const f = sleeveCheck("longsleeve", "M", 175, undefined, 58.5);
  assert.equal(f.fromFactory, true);
  assert.equal(f.sleeveCm, 58.5);
  assert.equal(sleeveCheck("longsleeve", "L", 175, undefined, 58.5).sleeveCm, 59.5);
  assert.equal(sleeveCheck("longsleeve", "M", 175, undefined, 5).fromFactory, false); // out of range ignored
  const r = tryOn({ chest: 100, height: 175 }, { garment: "longsleeve", sleeveCm: 58.5 });
  assert.equal(r.sleeve.sleeveCm, 58.5);
  assert.ok(r.notes.some(n => /factory's figure/.test(n)));
});
