import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tryOn, frontWidth, LANDMARKS } from "./tryon.mjs";

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
