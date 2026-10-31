import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDormer, validateDormer } from "./dormer.mjs";

const base = { width: 96, eaveHeight: 48, pitch: 8, mainPitch: 8 };
const get = (r, part) => r.parts.filter((p) => p.part === part);
const r16 = (n) => Math.round(n * 16) / 16;

test("geometry by hand: 8 ft wide, 4 ft eave, 8:12 on 8:12", () => {
  const r = layoutDormer(base);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.geometry.rise, 32);
  assert.equal(r.geometry.cheekRunToEave, 72); // 48 x 12 / 8
  assert.equal(r.geometry.ridgeLength, 120); // (48 + 32) x 12 / 8
  assert.equal(r.geometry.valleyLength, r16(Math.sqrt(48 * 48 + 48 * 48 + 32 * 32)));
  assert.equal(r.geometry.commonLength, r16(48 * Math.sqrt(1 + (8 / 12) ** 2)));
});

test("cheek studs fall with the main slope and stop where they reach nothing", () => {
  const r = layoutDormer(base);
  const lens = get(r, "cheek stud").map((p) => p.length).sort((a, b) => b - a);
  // x = 16: 48 - 10.667 - 4.5 = 32.83; 32: 22.17; 48: 11.5; 64: 0.83 (< 3, dropped)
  assert.deepEqual(lens, [r16(48 - 16 * 8 / 12 - 4.5), r16(48 - 32 * 8 / 12 - 4.5), 11.5]);
  assert.equal(r.counts.cheekStuds, 6);
});

test("commons while the eave is clear, valley jacks after", () => {
  const r = layoutDormer(base);
  assert.equal(r.counts.commons, 10); // stations 0..64 (x <= 72), two sides
  assert.equal(r.counts.jacks, 6); // 80, 96, 112
  const jacks = get(r, "valley jack").map((p) => p.length).sort((a, b) => b - a);
  const k = Math.sqrt(1 + (8 / 12) ** 2);
  assert.deepEqual(jacks, [r16(40 * k), r16(24 * k), r16(8 * k)]);
});

test("areas: plan 2(48x72 + 48x48/2)/144, sloped", () => {
  const r = layoutDormer(base);
  const plan = 2 * (48 * 72 + 48 * 48 / 2) / 144;
  assert.equal(r.areas.roofSqFt, Math.round(plan * Math.sqrt(1 + (8 / 12) ** 2) * 10) / 10);
});

test("a window replaces layout studs with kings, jacks, header and sill", () => {
  const r = layoutDormer({ ...base, window: { width: 36, height: 24, sill: 12 } });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(get(r, "king stud")[0].count, 2);
  assert.equal(get(r, "window header (2 plies)")[0].count, 2);
});

test("bad dimensions are refused", () => {
  assert.ok(validateDormer({ ...base, width: 10 }).length);
  assert.ok(validateDormer({ ...base, spacing: 20 }).length);
  assert.equal(layoutDormer({ ...base, pitch: 30 }).ok, false);
});

test("roof opening: headers, trimmers and cut rafters by hand", () => {
  const r = layoutDormer({ ...base, roofOpening: true });
  assert.ok(r.ok, JSON.stringify(r.errors));
  const k = Math.sqrt(1 + (8 / 12) ** 2);
  assert.equal(r.opening.depth, 72);
  assert.equal(r.opening.slopeLength, r16(72 * k));
  assert.equal(r.opening.cutMainRafters, 5); // 96 / 16 = 6 bays, 5 rafters inside
  assert.equal(get(r, "roof opening header (2 plies, up- and downslope)")[0].count, 4);
  assert.equal(get(r, "roof opening header (2 plies, up- and downslope)")[0].length, 96);
  assert.equal(get(r, "roof opening trimmer (doubled)")[0].length, r16(72 * k + 3));
  assert.equal(r.opening.area, 48);
  assert.equal(layoutDormer(base).opening, undefined);
});

test("roof opening honours depth, spacing and sizes; bad values refused", () => {
  const r = layoutDormer({ ...base, roofOpening: { depth: 48, mainSpacing: 24, headerSize: "2x10" } });
  assert.equal(r.opening.cutMainRafters, 3); // 4 bays
  assert.equal(get(r, "roof opening trimmer (doubled)")[0].size, "2x10");
  assert.ok(validateDormer({ ...base, roofOpening: { depth: 3 } }).length);
  assert.ok(validateDormer({ ...base, roofOpening: { mainSpacing: 20 } }).length);
});

import { layoutShedDormer } from "./dormer.mjs";
test("shed dormer by hand: 12 ft wide, 4 ft front wall, 3:12 on 8:12", () => {
  const r = layoutShedDormer({ width: 144, eaveHeight: 48, pitch: 3, mainPitch: 8 });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.geometry.cheekRunToRoof, r16(48 * 12 / 5)); // 115.2
  assert.equal(r.geometry.rafterLength, r16(115.2 * Math.sqrt(1 + (3 / 12) ** 2)));
  assert.equal(r.counts.rafters, 10); // 0..128 step 16 = 9, plus the far end
  const lens = get(r, "cheek stud").map((p) => p.length).sort((a, b) => b - a);
  assert.deepEqual(lens, [r16(48 - 16 * 5 / 12 - 4.5), r16(48 - 32 * 5 / 12 - 4.5), r16(48 - 48 * 5 / 12 - 4.5), r16(48 - 64 * 5 / 12 - 4.5), r16(48 - 80 * 5 / 12 - 4.5), r16(48 - 96 * 5 / 12 - 4.5)]);
});
test("shed dormer refuses a pitch not flatter than the main roof", () => {
  assert.equal(layoutShedDormer({ width: 144, eaveHeight: 48, pitch: 8, mainPitch: 8 }).ok, false);
});

test("shed dormer front window by hand: 144 in wide, 80 in eave, 36 x 36 on a 30 sill", () => {
  const r = layoutShedDormer({ width: 144, eaveHeight: 80, pitch: 3, mainPitch: 8, window: { width: 36, height: 36 } });
  assert.ok(r.ok, JSON.stringify(r.errors));
  // window spans 54..90; studs at 64 and 80 are inside, 0,16,32,48,96,112,128,144 stay (8) + 2 kings
  assert.equal(get(r, "front stud")[0].count, 8);
  assert.equal(get(r, "king stud")[0].count, 2);
  assert.equal(get(r, "jack stud")[0].length, 66);
  assert.equal(get(r, "window header (2 plies)")[0].length, 39);
  assert.equal(get(r, "cripple under sill")[0].count, 2);
  assert.equal(layoutShedDormer({ width: 144, eaveHeight: 80, pitch: 3, mainPitch: 8, window: { width: 200 } }).ok, false);
});

test("shed dormer main-roof opening, by hand", () => {
  // planes meet 48 x 12 / 5 = 115.2 in back; 144 in wide at 24 in -> ceil(6) - 1 = 5 cut rafters
  const r = layoutShedDormer({ width: 144, eaveHeight: 48, pitch: 3, mainPitch: 8, roofOpening: { mainSpacing: 24 } });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.opening.depth, r16(115.2));
  assert.equal(r.opening.cutMainRafters, 5);
  const t = r.parts.find((p) => p.part === "roof opening trimmer (doubled)");
  assert.equal(t.length, r16(115.2 * Math.sqrt(1 + (8 / 12) ** 2) + 3));
  assert.equal(layoutShedDormer({ width: 144, eaveHeight: 48, pitch: 3, mainPitch: 8, roofOpening: { depth: 5 } }).ok, false);
});

test("a negative or non-numeric window sill is rejected, gable and shed", () => {
  for (const [f, pitch] of [[layoutDormer, 8], [layoutShedDormer, 3]]) {
    for (const sill of [-5, NaN]) {
      const d = f({ width: 72, eaveHeight: 60, pitch, mainPitch: 8, window: { width: 36, height: 24, sill } });
      assert.equal(d.ok, false);
      assert.match(d.errors.join(" "), /sill height cannot be negative/);
    }
    assert.equal(f({ width: 72, eaveHeight: 60, pitch, mainPitch: 8, window: { width: 36, height: 24, sill: 0 } }).ok, true);
  }
});
