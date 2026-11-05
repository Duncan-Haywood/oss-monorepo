import test from "node:test";
import assert from "node:assert/strict";
import { washSymbol, bleachSymbol, drySymbol, ironSymbol, proSymbol, careCodes, careStrip, careFiles, WASH, BLEACH, DRY, IRON, PRO } from "./caresymbols.mjs";
import { suggestCare, parseComposition } from "./labels.mjs";

const wellFormed = s => { assert.match(s, /^<svg [^>]*viewBox="0 0 36 36"/); assert.match(s, /aria-label="[^"]+"/); assert.ok(s.endsWith("</svg>")); assert.equal((s.match(/<svg/g) || []).length, 1); };

test("every code draws a labelled svg", () => {
  for (const c of WASH) wellFormed(washSymbol(c));
  for (const c of BLEACH) wellFormed(bleachSymbol(c));
  for (const c of DRY) wellFormed(drySymbol(c));
  for (const c of IRON) wellFormed(ironSymbol(c));
  for (const c of PRO) wellFormed(proSymbol(c));
});
test("wash tub carries the temperature and bars for gentle cycles", () => {
  assert.match(washSymbol("40"), />40</);
  assert.equal((washSymbol("30-gentle").match(/M3 33H33/g) || []).length, 1);
  assert.equal((washSymbol("30-very-gentle").match(/M3 3[36]H33/g) || []).length, 2);
  assert.match(washSymbol("30-very-gentle"), /very gentle/);
});
test("prohibitions carry the cross, permissions do not", () => {
  for (const s of [washSymbol("none"), bleachSymbol("none"), drySymbol("tumble-none"), ironSymbol("none"), proSymbol("none")]) assert.match(s, /M3 3L33 33/);
  for (const s of [washSymbol("40"), bleachSymbol("any"), drySymbol("tumble-low"), ironSymbol("low"), proSymbol("any")]) assert.doesNotMatch(s, /M3 3L33 33/);
});
test("dots count heat: iron low/medium/high, tumble low/normal", () => {
  const n = s => (s.match(/<circle[^>]*r="1.5"/g) || []).length;
  assert.deepEqual([ironSymbol("low"), ironSymbol("medium"), ironSymbol("high")].map(n), [1, 2, 3]);
  assert.deepEqual([drySymbol("tumble-low"), drySymbol("tumble-normal")].map(n), [1, 2]);
});
test("careCodes maps every suggestCare tier to known codes", () => {
  for (const comp of ["100% cotton", "95% cotton, 5% elastane", "50% viscose, 50% cotton", "100% wool", "100% silk"]) {
    const c = careCodes(suggestCare(parseComposition(comp).parts));
    assert.ok(WASH.includes(c.wash), comp); assert.ok(BLEACH.includes(c.bleach), comp);
    assert.ok(DRY.includes(c.dry), comp); assert.ok(IRON.includes(c.iron), comp);
  }
});
test("cotton is 40 wash, wool is hand wash with professional care and dry flat", () => {
  const cot = careCodes(suggestCare(parseComposition("100% cotton").parts));
  assert.equal(cot.wash, "40"); assert.equal(cot.bleach, "non-chlorine"); assert.equal(cot.dry, "tumble-low"); assert.equal(cot.iron, "medium"); assert.equal(cot.pro, null);
  const wool = careCodes(suggestCare(parseComposition("100% wool").parts));
  assert.equal(wool.wash, "hand"); assert.equal(wool.dry, "flat"); assert.equal(wool.pro, "gentle"); assert.equal(wool.iron, "low");
});
test("strip and files skip unknown positions and handle null", () => {
  assert.equal(careStrip(null), ""); assert.deepEqual(careFiles(null), []);
  const f = careFiles(careCodes(suggestCare(parseComposition("100% cotton").parts)));
  assert.deepEqual(f.map(x => x.name), ["care-wash.svg", "care-bleach.svg", "care-dry.svg", "care-iron.svg"]);
  assert.equal((careStrip(careCodes(suggestCare(parseComposition("100% wool").parts))).match(/<svg/g) || []).length, 5);
});
